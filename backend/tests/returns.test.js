// Integration tests for the item return flow, run against a real PostgreSQL database.
//
// They need an EMPTY database whose name ends in "_test". The tests apply every migration,
// seed their own data, and wipe the database afterwards. They never send email.
//
//   $env:TEST_DATABASE_URL = "postgres://postgres@127.0.0.1:55432/asset_test"
//   npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  test('return flow (set TEST_DATABASE_URL to an empty *_test database to run)', { skip: true }, () => {});
  return;
}
if (!new URL(testDatabaseUrl).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must point at a database whose name ends in "_test".');
}

// Configure the app for the test database before any app module loads.
Object.assign(process.env, {
  DATABASE_URL: testDatabaseUrl,
  JWT_SECRET: 'return-flow-test-secret-'.padEnd(40, 'x'),
  SMTP_HOST: 'smtp.invalid',
  SMTP_PORT: '587',
  SMTP_USER: 'gso@invalid',
  SMTP_PASS: 'not-used',
});
const mail = [];
const nodemailer = require('nodemailer');
nodemailer.createTransport = () => ({ sendMail: async (message) => { mail.push(message); } });

const pool = require('../src/config/db');
const returnsService = require('../src/modules/issuances/returns.service');
const issuancesService = require('../src/modules/issuances/issuances.service');
const issuancesRepository = require('../src/modules/issuances/issuances.repository');
const employeesService = require('../src/modules/employees/employees.service');
const labelsService = require('../src/modules/issuances/labels.service');
const requestsService = require('../src/modules/requests/requests.service');
const countsService = require('../src/modules/inventory/counts.service');
const countsRepository = require('../src/modules/inventory/counts.repository');
const { getAvailableQuantity } = require('../src/modules/inventory/inventory.stock');

const gso = { id: '1', name: 'GSO Staff One', email: 'gso@invalid', roles: ['GSO_STAFF'] };
const admin = { id: '2', name: 'IT Admin One', email: 'admin@invalid', roles: ['IT_ADMIN'] };
const TAG1 = 'AST-AAAAAAAAAAAA1';
const TAG2 = 'AST-AAAAAAAAAAAA2';
const TAG3 = 'AST-AAAAAAAAAAAA3';

const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
const lastCode = () => mail.at(-1).text.match(/Your confirmation code: (\d{6})/)[1];
const wrongCode = (code) => (code === '000000' ? '111111' : '000000');
const rejects = (promise, pattern, status) => assert.rejects(promise, (error) => {
  assert.match(error.message, pattern);
  if (status) assert.equal(error.status, status);
  return true;
});
const returnRow = (where, params) => one(`SELECT id::TEXT AS id, confirmation_method, returned_by_name, status, approval_action, approval_decision_note
  FROM employee_issuance_returns WHERE ${where} ORDER BY id DESC LIMIT 1`, params);
const tagCodeFor = async (tag) => {
  const challenge = await returnsService.sendTaggedReturnOtp(tag, gso);
  return { otpChallengeId: challenge.challengeId, otp: lastCode() };
};

const seed = `
  INSERT INTO users (id, name, email, password_hash) VALUES
    (1, 'GSO Staff One', 'gso@invalid', 'x'),
    (2, 'IT Admin One', 'admin@invalid', 'x'),
    (3, 'Requester One', 'requester@invalid', 'x');
  INSERT INTO employees (id, employee_code, department, last_name, first_name, position, email) VALUES
    (1, 'EMP-1', 'Academic Affairs', 'Bautista', 'Tristan', 'Lab Coordinator', 'tristan@invalid'),
    (2, 'EMP-2', 'Registrar', 'Cruz', 'Maria', 'Clerk', 'maria@invalid');
  INSERT INTO item_catalog (id, item_code, category, description, category_id, item_name, unit_of_measure,
                            quantity, tracking_mode, issue_behavior, inventory_status, condition) VALUES
    (1, 'LAP-1', 'Electronics', 'Laptop', (SELECT min(id) FROM item_categories), 'Laptop', 'piece', 3, 'individual', 'returnable', 'Issued', 'New'),
    (2, 'CHR-1', 'Furniture', 'Mono block', (SELECT min(id) FROM item_categories), 'Mono block', 'set', 10, 'quantity', 'returnable', 'Issued', 'Good'),
    (3, 'PRJ-1', 'Electronics', 'Projector', (SELECT min(id) FROM item_categories), 'Projector', 'unit', 3, 'quantity', 'returnable', 'Available', 'Good');
  INSERT INTO employee_issuance_batches (id, employee_id, token_hash, token_expires_at, status,
      borrow_use_date, expected_return_date, use_location, use_purpose, borrow_use_at, expected_return_at) VALUES
    (1, 1, 'b1', NOW(), 'Issued', CURRENT_DATE - 3, CURRENT_DATE - 1, 'Gym', 'Event', NOW() - INTERVAL '3 days', NOW() - INTERVAL '1 day'),
    (2, 2, 'b2', NOW(), 'Issued', CURRENT_DATE, CURRENT_DATE + 3, 'Office', 'Work', NOW(), NOW() + INTERVAL '3 days');
  INSERT INTO employee_issuances (id, employee_id, item_id, batch_id, token_expires_at, item_condition, quantity, status, unit_of_measure) VALUES
    (1, 1, 1, NULL, NOW(), 'New', 1, 'Issued', 'piece'),
    (2, 1, 1, NULL, NOW(), 'New', 1, 'Issued', 'piece'),
    (3, 1, 1, NULL, NOW(), 'New', 1, 'Issued', 'piece'),
    (4, 1, 2, 1, NOW(), 'Good', 6, 'Issued', 'set'),
    (5, 2, 2, 2, NOW(), 'Good', 2, 'Issued', 'set');
  INSERT INTO asset_unit_tags (id, tag_code, item_id, unit_number, condition, custody_status, lifecycle_status,
                               issuance_id, assigned_employee_id, location) VALUES
    (1, '${TAG1}', 1, 1, 'New', 'Issued', 'Active', 1, 1, 'Academic Affairs'),
    (2, '${TAG2}', 1, 2, 'New', 'Issued', 'Active', 2, 1, 'Academic Affairs'),
    (3, '${TAG3}', 1, 3, 'New', 'Issued', 'Active', 3, 1, 'Academic Affairs');
  INSERT INTO requester_identity_profiles (user_id, employee_code, department, position, contact_number, verification_status)
    VALUES (3, 'EMP-2', 'Registrar', 'Clerk', '09171234567', 'Verified');
  INSERT INTO service_requests (id, reference_no, title, request_type, status, requested_by_user_id)
    VALUES (1, 'REQ-1', 'Projector loan', 'BORROWING', 'Return Requested', 3);
  INSERT INTO service_request_assets (id, request_id, item_id, quantity, unit_of_measure, issued_at, due_date, condition_out)
    VALUES (1, 1, 3, 1, 'unit', NOW() - INTERVAL '2 days', CURRENT_DATE + 1, 'Good');
`;

test.before(async () => {
  const { rows } = await pool.query("SELECT COUNT(*)::INTEGER AS tables FROM information_schema.tables WHERE table_schema = 'public'");
  if (rows[0].tables) throw new Error('The test database must be empty; it already has tables.');
  const migrationsDir = path.join(__dirname, '../database/migrations');
  for (const file of fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    await pool.query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  await pool.query(seed);
});

test.after(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.end();
});

test('a scanned return still needs the employee code, then emails a receipt', async () => {
  const input = { condition: 'Good', reason: 'Tapos na gamitin', entryMethod: 'scan', returnedByName: 'Utility Staff' };
  await rejects(returnsService.confirmScannedTagReturn(TAG1, input, gso), /6-digit code/, 400);
  assert.equal((await one('SELECT custody_status FROM asset_unit_tags WHERE id = 1')).custody_status, 'Issued');
  const result = await returnsService.confirmScannedTagReturn(TAG1, { ...input, ...(await tagCodeFor(TAG1)) }, gso);
  assert.equal(result.emailQueued, true);
  assert.match(mail.at(-1).subject, /Return receipt: Laptop/);
  assert.match(mail.at(-1).text, /Brought in by: Utility Staff/);
  assert.equal((await one('SELECT custody_status FROM asset_unit_tags WHERE id = 1')).custody_status, 'Available');
  const row = await returnRow('asset_unit_tag_id = 1');
  assert.deepEqual([row.confirmation_method, row.returned_by_name], ['employee_code', 'Utility Staff']);
});

test('a returned unit cannot be handed straight to another employee', async () => {
  await rejects(returnsService.confirmScannedTagReturn(TAG2, {
    condition: 'Good', reason: 'x', entryMethod: 'scan', destination: 'employee', targetEmployeeCode: 'EMP-2',
  }, gso), /Main Issuance/, 400);
});

test('a typed barcode needs the employee code, counts wrong guesses, and uses the code once', async () => {
  const typed = (extra) => ({ condition: 'Needs Repair', reason: 'Sira o may depekto — cracked screen', entryMethod: 'typed', ...extra });
  await rejects(returnsService.confirmScannedTagReturn(TAG2, typed({}), gso), /6-digit code/, 400);
  const challenge = await returnsService.sendTaggedReturnOtp(TAG2, gso);
  const code = lastCode();
  assert.equal(challenge.sentTo, 'tr*****@invalid');
  await rejects(returnsService.confirmScannedTagReturn(TAG2, typed({ otpChallengeId: challenge.challengeId, otp: wrongCode(code) }), gso), /4 subok/);
  assert.equal((await one('SELECT attempts FROM asset_return_otps WHERE id = $1', [challenge.challengeId])).attempts, 1);
  const result = await returnsService.confirmScannedTagReturn(TAG2, typed({ otpChallengeId: challenge.challengeId, otp: code }), gso);
  assert.equal(result.destination, 'To Be Repaired');
  await rejects(returnsService.confirmScannedTagReturn(TAG2, typed({ otpChallengeId: challenge.challengeId, otp: code }), gso), /naka-issue|Nag-expire/);
  assert.equal((await returnRow('asset_unit_tag_id = 2')).confirmation_method, 'typed_code');
});

test('an issued unit cannot have its condition rewritten through inspection', async () => {
  await assert.rejects(
    issuancesRepository.updateAssetTagInspection({ tagCode: TAG3, condition: 'Retired', note: 'n', changedByUserId: '1' }),
    (error) => error.status === 409,
  );
});

test('a lost unit is recorded with the employee code; override and void are gone', async () => {
  for (const removed of ['createAdminOverride', 'getActiveOverride', 'voidReturn', 'listReturnLedger']) {
    assert.equal(returnsService[removed], undefined);
  }
  const result = await returnsService.confirmScannedTagReturn(TAG3, {
    condition: 'Lost', reason: 'Iba pa — left in a taxi', entryMethod: 'scan', ...(await tagCodeFor(TAG3)),
  }, gso);
  assert.equal(result.status, 'Lost');
  assert.equal(result.confirmationMethod, 'employee_code');
  assert.equal((await one('SELECT lifecycle_status FROM asset_unit_tags WHERE id = 3')).lifecycle_status, 'Disposed');
  assert.equal((await one('SELECT quantity FROM item_catalog WHERE id = 1')).quantity, 2);
});

test('a lost unit always needs a code, even when scanned', async () => {
  await rejects(returnsService.confirmScannedTagReturn(TAG1, { condition: 'Lost', reason: 'x', entryMethod: 'scan' }, gso), /maitalang nawala/);
});

test('a bulk return splits conditions under one code and keeps the stock condition', async () => {
  const lines = [{ condition: 'Good', quantity: 3 }, { condition: 'Needs Repair', quantity: 2 }, { condition: 'Lost', quantity: 1 }];
  await rejects(returnsService.createEmployeeReturn({
    employeeCode: 'EMP-1', itemCode: 'CHR-1', issuanceId: '4', reason: 'Tapos na gamitin', lines,
  }, gso), /6-digit code/);
  const challenge = await returnsService.sendBulkReturnOtp({ issuanceId: '4', lines }, gso);
  const code = lastCode();
  assert.match(mail.at(-1).text, /3 set returned in Good condition, 2 set returned in Needs Repair condition, 1 set reported lost/);
  const base = { employeeCode: 'EMP-1', itemCode: 'CHR-1', issuanceId: '4', reason: 'Tapos na gamitin', otpChallengeId: challenge.challengeId, otp: code };
  await rejects(returnsService.createEmployeeReturn({ ...base, lines: [{ condition: 'Good', quantity: 6 }] }, gso), /Nagbago ang quantity o condition/);
  assert.equal((await one('SELECT attempts FROM asset_return_otps WHERE id = $1', [challenge.challengeId])).attempts, 0);

  const before = await one('SELECT quantity FROM item_catalog WHERE id = 2');
  assert.equal(await getAvailableQuantity(pool, { id: '2', quantity: before.quantity }), 2);
  const result = await returnsService.createEmployeeReturn({ ...base, lines, returnedByName: 'Driver' }, gso);
  assert.deepEqual(result.lines.map((line) => [line.condition, line.quantity, line.status]),
    [['Good', 3, 'Returned'], ['Needs Repair', 2, 'Returned'], ['Lost', 1, 'Lost']]);
  const item = await one('SELECT condition, quantity, repair_quantity FROM item_catalog WHERE id = 2');
  assert.deepEqual([item.condition, item.quantity, item.repair_quantity], ['Good', 9, 2]);
  // 9 in stock, 2 still with EMP-2, 2 set aside for repair.
  assert.equal(await getAvailableQuantity(pool, { id: '2', quantity: item.quantity }), 5);
  assert.equal((await one('SELECT status FROM employee_issuances WHERE id = 4')).status, 'Returned');
  assert.match(mail.at(-1).text, /Reported lost: 1 set/);
});

test('new issuances are blocked while a lost item is unsettled', async () => {
  const holdings = await returnsService.listHoldings({ employeeCode: 'EMP-1' });
  assert.equal(holdings.accountabilities.length, 2);
  await rejects(issuancesService.createIssuanceBatch({ employeeCode: 'EMP-1', items: [{ itemId: '3', quantity: 1 }] }, gso), /2 nawalang item/, 409);
});

test('paid and replaced settlements need IT Admin approval from someone else; only IT Admin waives', async () => {
  const lostBulk = await returnRow('issuance_id = 4 AND status = $1', ['Lost']);
  const lostTag = await returnRow('asset_unit_tag_id = 3');
  await rejects(returnsService.updateReturnSettlement(lostBulk.id, { status: 'Replaced', note: 'x' }, admin), /i-aapprove ng IT Admin/, 400);
  await rejects(returnsService.requestReturnApproval(lostBulk.id, { action: 'Replaced', note: ' ' }, gso), /detalye ng ipinalit/, 400);

  await returnsService.requestReturnApproval(lostBulk.id, { action: 'Replaced', note: 'Brought a new mono block' }, gso);
  await rejects(returnsService.requestReturnApproval(lostBulk.id, { action: 'Paid', note: 'OR 1' }, gso), /hinihintay/, 409);
  assert.equal((await one('SELECT quantity FROM item_catalog WHERE id = 2')).quantity, 9);
  await rejects(returnsService.decideApprovalRequest(lostBulk.id, { decision: 'approve' }, gso), /Ibang tao/, 403);
  await returnsService.decideApprovalRequest(lostBulk.id, { decision: 'approve', note: 'Checked the unit' }, admin);
  assert.equal((await one('SELECT quantity FROM item_catalog WHERE id = 2')).quantity, 10);
  const settled = await one('SELECT settlement_status, settled_by_user_id::TEXT AS by FROM employee_issuance_returns WHERE id = $1', [lostBulk.id]);
  assert.deepEqual([settled.settlement_status, settled.by], ['Replaced', '2']);

  await returnsService.requestReturnApproval(lostTag.id, { action: 'Paid', note: 'OR 12345' }, gso);
  await rejects(returnsService.decideApprovalRequest(lostTag.id, { decision: 'reject' }, admin), /dahilan ng pag-decline/, 400);
  await returnsService.decideApprovalRequest(lostTag.id, { decision: 'reject', note: 'No such OR in the cashier log' }, admin);
  const declined = await returnRow('id = $1', [lostTag.id]);
  assert.deepEqual([declined.approval_action, declined.approval_decision_note], [null, 'No such OR in the cashier log']);
  const holdings = await returnsService.listHoldings({ employeeCode: 'EMP-1' });
  assert.equal(holdings.accountabilities.find((entry) => entry.returnId === lostTag.id).approvalDecisionNote, 'No such OR in the cashier log');

  await returnsService.updateReturnSettlement(lostTag.id, { status: 'Waived', note: 'Approved by the director' }, admin);
  await rejects(returnsService.requestReturnApproval(lostTag.id, { action: 'Paid', note: 'again' }, gso), /Wala nang nakabinbing/);
  assert.equal((await issuancesRepository.getEmployeeReturnBlockers('EMP-1')).unsettled, 0);
});

test('repairs: GSO puts units back, but a write-off needs IT Admin approval', async () => {
  const bulkRepair = await returnRow('issuance_id = 4 AND return_condition = $1', ['Needs Repair']);
  await rejects(returnsService.resolveReturnRepair(bulkRepair.id, { outcome: 'Written Off', note: 'x' }, gso), /i-request/, 400);
  await returnsService.resolveReturnRepair(bulkRepair.id, { outcome: 'Repaired' }, gso);
  assert.equal((await one('SELECT repair_quantity FROM item_catalog WHERE id = 2')).repair_quantity, 0);
  await rejects(returnsService.resolveReturnRepair(bulkRepair.id, { outcome: 'Repaired' }, gso), /Tapos na/);
  await rejects(returnsService.requestReturnApproval(bulkRepair.id, { action: 'Written Off', note: 'x' }, gso), /repair queue/);

  const tagRepair = await returnRow('asset_unit_tag_id = 2');
  await returnsService.requestReturnApproval(tagRepair.id, { action: 'Written Off', note: 'Screen beyond repair' }, gso);
  assert.equal((await one('SELECT lifecycle_status FROM asset_unit_tags WHERE id = 2')).lifecycle_status, 'Active');
  const [request] = await returnsService.listApprovalRequests(admin);
  assert.deepEqual([request.returnId, request.action, request.requestedBy, request.requestedByYou], [tagRepair.id, 'Written Off', 'GSO Staff One', false]);
  assert.equal((await returnsService.listApprovalRequests(gso))[0].requestedByYou, true);
  await returnsService.decideApprovalRequest(tagRepair.id, { decision: 'approve' }, admin);
  assert.equal((await one('SELECT lifecycle_status FROM asset_unit_tags WHERE id = 2')).lifecycle_status, 'Disposed');
  assert.equal((await one('SELECT quantity FROM item_catalog WHERE id = 1')).quantity, 1);
  assert.deepEqual(await returnsService.listApprovalRequests(admin), []);
});

test('an employee email cannot change while items are out, and the old address is told', async () => {
  const profile = (code, email, extra) => ({
    employeeCode: code, department: 'Registrar', firstName: 'Maria', lastName: 'Cruz', position: 'Clerk',
    email, status: 'Active', reason: 'Updated email', ...extra,
  });
  await rejects(employeesService.updateEmployee('EMP-2', profile('EMP-2', 'staff.gmail@school.test'), gso), /Hindi mapapalitan ang email/, 409);
  const locks = Object.fromEntries((await employeesService.listEmployees()).map((employee) => [employee.id, employee.emailLocked]));
  assert.deepEqual(locks, { 'EMP-1': false, 'EMP-2': true });

  const tristan = await employeesService.updateEmployee('EMP-1', profile('EMP-1', 'tristan.new@school.test', {
    department: 'Academic Affairs', firstName: 'Tristan', lastName: 'Bautista', position: 'Lab Coordinator',
  }), gso);
  assert.equal(tristan.emailLocked, false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mail.at(-1).to, 'tristan@invalid');
  assert.match(mail.at(-1).text, /changed the email on your GSO employee record to tristan\.new@school\.test/);
});

test('overdue reusable-stock borrowings get one reminder a day and block new issuances', async () => {
  await pool.query(`
    INSERT INTO employee_issuance_batches (id, employee_id, token_hash, token_expires_at, status,
        borrow_use_date, expected_return_date, use_location, use_purpose, borrow_use_at, expected_return_at)
      VALUES (3, 2, 'b3', NOW(), 'Issued', CURRENT_DATE - 2, CURRENT_DATE - 1, 'Hall', 'Seminar', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 hour');
    INSERT INTO employee_issuances (id, employee_id, item_id, batch_id, token_expires_at, item_condition, quantity, status, unit_of_measure)
      VALUES (6, 2, 3, 3, NOW(), 'Good', 1, 'Issued', 'unit');
  `);
  assert.equal(await returnsService.sendOverdueReminders(), 1);
  assert.match(mail.at(-1).subject, /overdue/);
  assert.equal(mail.at(-1).to, 'maria@invalid');
  assert.equal(await returnsService.sendOverdueReminders(), 0);
  await rejects(issuancesService.createIssuanceBatch({ employeeCode: 'EMP-2', items: [{ itemId: '3', quantity: 1 }] }, gso), /1 overdue/, 409);
  const holdings = await returnsService.listHoldings({ employeeCode: 'EMP-2' });
  assert.ok(holdings.items.some((entry) => entry.itemCode === 'PRJ-1' && entry.isOverdue && entry.source === 'GSO issuance'));
  assert.ok(holdings.items.some((entry) => entry.source === 'Request Center' && entry.referenceNo === 'REQ-1'));
});

test('a Request Center return needs a condition for each item and keeps damaged ones in repair', async () => {
  await rejects(requestsService.updateStatus('1', { status: 'Returned' }, gso), /Choose the returned condition/);
  await rejects(requestsService.updateStatus('1', { status: 'Returned', conditionsIn: { 1: 'Needs Repair' } }, gso), /so choose For Repair/);
  await rejects(requestsService.updateStatus('1', { status: 'For Repair', conditionsIn: { 1: 'Needs Repair' } }, gso), /review note/);
  await requestsService.updateStatus('1', { status: 'For Repair', conditionsIn: { 1: 'Needs Repair' }, note: 'Lens cracked' }, gso);
  assert.equal((await one('SELECT condition_in FROM service_request_assets WHERE id = 1')).condition_in, 'Needs Repair');
});

test('a blind inventory count reports quantity differences and misplaced barcodes', async () => {
  const expected = (await countsRepository.listExpectedOnHand()).items.find((item) => item.itemId === '2');
  const count = await countsService.submitCount({
    items: [{ itemId: '2', countedQuantity: Number(expected.expected) - 1 }],
    scannedTagCodes: [(await one('SELECT tag_code FROM asset_unit_tags WHERE id = 1')).tag_code, 'AST-ZZZZZZZZZZZZZ'],
    note: 'Monthly count',
  }, gso);
  assert.equal(count.lines.items[0].difference, -1);
  assert.deepEqual(count.lines.tagFindings, [{ tagCode: 'AST-ZZZZZZZZZZZZZ', finding: 'Unknown barcode' }]);
  assert.equal(count.discrepancyCount, 2);
  assert.equal((await countsService.listCounts())[0].countedBy, 'GSO Staff One');
});

test('issuance records put each issuance and its returns in one row with its current status', async () => {
  const records = Object.fromEntries((await returnsService.listIssuanceRecords({})).map((record) => [record.id, record]));
  const summary = (id) => {
    const { status, outQuantity, returnedQuantity, lostQuantity } = records[id];
    return [status, outQuantity, returnedQuantity, lostQuantity];
  };
  assert.deepEqual(summary('1'), ['Returned', 0, 1, 0]);
  assert.deepEqual(records['1'].returns.map((entry) => entry.status), ['Returned']);
  assert.deepEqual(records['1'].tagCodes, [TAG1]);
  assert.deepEqual(summary('3'), ['Lost', 0, 0, 1]);
  assert.equal(records['3'].returns[0].settlementStatus, 'Waived');
  assert.deepEqual(summary('4'), ['Returned', 0, 5, 1]);
  assert.equal(records['4'].returns.find((entry) => entry.condition === 'Needs Repair').repairOutcome, 'Repaired');
  assert.deepEqual(summary('5'), ['Issued', 2, 0, 0]);
  assert.deepEqual(summary('6'), ['Overdue', 1, 0, 0]);
  assert.equal(records['6'].purpose, 'Seminar');

  // Two days ahead in UTC is always after today in Manila.
  const later = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  assert.deepEqual(await returnsService.listIssuanceRecords({ from: later }), []);
  assert.equal((await returnsService.listIssuanceRecords({ to: later })).length, 6);
  await rejects(returnsService.listIssuanceRecords({ from: '2026-02-30' }), /Hindi valid/, 400);
  await rejects(returnsService.listIssuanceRecords({ to: '2026-13-40' }), /Hindi valid/, 400);
  await rejects(returnsService.listIssuanceRecords({ from: '2026-11-07', to: '2026-11-01' }), /mas maaga/, 400);
});

test('GSO cannot record a handover for an employee who confirms in their own account', async () => {
  await pool.query(`INSERT INTO employee_issuance_batches (id, employee_id, token_hash, token_expires_at, status, requester_user_id)
    VALUES (4, 2, 'b4', NOW() + INTERVAL '1 day', 'Pending', 3)`);
  await rejects(issuancesService.recordIssuanceHandover('4', { method: 'signed_receipt', reference: 'Logbook 12' }, gso), /Requester account/, 409);
});

test('a reprinted label gets a new barcode, and the old one stops working', async () => {
  const TAG4 = 'AST-AAAAAAAAAAAA4';
  await pool.query(`
    INSERT INTO item_catalog (id, item_code, category, description, category_id, item_name, unit_of_measure,
                              quantity, tracking_mode, issue_behavior, inventory_status, condition) VALUES
      (4, 'LAP-2', 'Electronics', 'Laptop Pro', (SELECT min(id) FROM item_categories), 'Laptop Pro', 'piece', 1, 'individual', 'returnable', 'Issued', 'Good');
    INSERT INTO employee_issuances (id, employee_id, item_id, token_expires_at, item_condition, quantity, status, unit_of_measure, decided_at)
      VALUES (7, 2, 4, NOW(), 'Good', 1, 'Issued', 'piece', NOW());
    INSERT INTO asset_unit_tags (id, tag_code, item_id, unit_number, serial_number, condition, custody_status, lifecycle_status,
                                 issuance_id, assigned_employee_id, location)
      VALUES (4, '${TAG4}', 4, 1, 'SN-ABC-12345', 'Good', 'Issued', 'Active', 7, 2, 'Registrar');
  `);
  const stale = await tagCodeFor(TAG4);
  await rejects(labelsService.reprintUnitLabel(TAG4, { reason: ' ' }, gso), /bakit/, 400);
  const label = await labelsService.reprintUnitLabel(TAG4, { reason: 'Label peeled off' }, gso);
  assert.equal(label.labelVersion, 2);
  assert.notEqual(label.tagCode, TAG4);
  assert.match(label.tagCode, /^AST-[A-Z0-9]{13}$/);

  await rejects(issuancesService.getAssetTag(TAG4), /Luma na ang label/, 409);
  await rejects(labelsService.reprintUnitLabel(TAG4, { reason: 'again' }, gso), /Luma na ang label/, 409);
  await rejects(returnsService.confirmScannedTagReturn(label.tagCode, {
    condition: 'Good', reason: 'x', entryMethod: 'scan', serialLast4: '2345', ...stale,
  }, gso), /Nag-expire o nagamit/);

  // Only units with an employee are listed; returned, lost, and written-off units are not.
  const labels = await labelsService.listUnitLabels();
  assert.deepEqual(labels.map((entry) => entry.itemCode), ['LAP-2']);
  assert.deepEqual([labels[0].tagCode, labels[0].holderName, labels[0].labelVersion, labels[0].reprintReason, labels[0].needsPrinting],
    [label.tagCode, 'Maria Cruz', 2, 'Label peeled off', true]);
  await rejects(labelsService.reprintUnitLabel(TAG3, { reason: 'x' }, gso), /Lost o written off/, 409);
});

test('each barcode prints once without a reason; printing it again needs a reprint', async () => {
  const unitLabel = async () => (await labelsService.listUnitLabels()).find((entry) => entry.itemCode === 'LAP-2');
  const unit = await unitLabel();
  assert.equal(unit.needsPrinting, true);
  assert.equal((await labelsService.recordLabelPrint(unit.tagCode, gso)).tagCode, unit.tagCode);
  await rejects(labelsService.recordLabelPrint(unit.tagCode, gso), /Na-print na .* ni GSO Staff One/, 409);
  assert.deepEqual([(await unitLabel()).needsPrinting, (await unitLabel()).labelPrintedBy, (await unitLabel()).reprintReason], [false, 'GSO Staff One', 'Label peeled off']);

  const label = await labelsService.reprintUnitLabel(unit.tagCode, { reason: 'Printer error' }, gso);
  assert.equal((await unitLabel()).needsPrinting, true);
  await pool.query('UPDATE employee_issuances SET batch_id = 2 WHERE id = 7');
  const batchTag = async (code) => (await issuancesRepository.getIssuanceBatch('2')).items.flatMap((item) => item.tags).find((tag) => tag.tagCode === code);
  assert.deepEqual([(await batchTag(label.tagCode)).printedAt, (await batchTag(label.tagCode)).returned], [null, false]);
  await labelsService.recordLabelPrint(label.tagCode, gso);
  assert.ok((await batchTag(label.tagCode)).printedAt);
  await rejects(labelsService.recordLabelPrint(unit.tagCode, gso), /Luma na/, 409);
});

test('a returned unit retires its barcode: it no longer scans, prints, or shows in the label list', async () => {
  const [current] = (await labelsService.listUnitLabels()).filter((entry) => entry.itemCode === 'LAP-2');
  const base = { condition: 'Good', reason: 'Tapos na gamitin', entryMethod: 'scan' };
  await rejects(returnsService.confirmScannedTagReturn(current.tagCode, { ...base, ...(await tagCodeFor(current.tagCode)) }, gso), /huling 4/, 400);
  const code = await tagCodeFor(current.tagCode);
  await rejects(returnsService.confirmScannedTagReturn(current.tagCode, { ...base, ...code, serialLast4: '9999' }, gso), /Hindi tugma ang serial/, 400);
  const result = await returnsService.confirmScannedTagReturn(current.tagCode, { ...base, ...code, serialLast4: '2345' }, gso);
  assert.deepEqual([result.destination, result.tagCode], ['GSO Storage', current.tagCode]);

  assert.deepEqual(await labelsService.listUnitLabels(), []);
  await rejects(issuancesService.getAssetTag(current.tagCode), /Naibalik na ang Laptop Pro/, 409);
  await rejects(labelsService.recordLabelPrint(current.tagCode, gso), /naibalik na ang unit/, 409);
  const unit = await one('SELECT tag_code, label_version, label_printed_at FROM asset_unit_tags WHERE id = 4');
  assert.notEqual(unit.tag_code, current.tagCode);
  assert.deepEqual([unit.label_version, unit.label_printed_at], [4, null]);
  await rejects(labelsService.recordLabelPrint(unit.tag_code, gso), /Nasa GSO ang unit/, 409);

  // Records still show the barcode the unit had while it was out.
  const batchTag = (await issuancesRepository.getIssuanceBatch('2')).items.flatMap((item) => item.tags).find((tag) => tag.returned);
  assert.equal(batchTag.tagCode, current.tagCode);
  const record = (await returnsService.listIssuanceRecords({})).find((entry) => entry.id === '7');
  assert.deepEqual([record.tagCodes, record.returns[0].tagCode], [[current.tagCode], current.tagCode]);
});
