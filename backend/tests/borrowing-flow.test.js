// Integration tests for the borrowing flow: request, approval that starts the loan, and GSO return inspection.
// They run against a real PostgreSQL database, the same way as returns.test.js.
//
//   $env:TEST_DATABASE_URL = "postgres://postgres@127.0.0.1:55432/asset_test"
//   npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  test('borrowing flow (set TEST_DATABASE_URL to an empty *_test database to run)', { skip: true }, () => {});
  return;
}
if (!new URL(testDatabaseUrl).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must point at a database whose name ends in "_test".');
}

Object.assign(process.env, {
  DATABASE_URL: testDatabaseUrl,
  JWT_SECRET: 'borrowing-flow-test-secret-'.padEnd(40, 'x'),
  SMTP_HOST: 'smtp.invalid',
  SMTP_PORT: '587',
  SMTP_USER: 'gso@invalid',
  SMTP_PASS: 'not-used',
});
const nodemailer = require('nodemailer');
nodemailer.createTransport = () => ({ sendMail: async () => {} });

const pool = require('../src/config/db');
const requestsService = require('../src/modules/requests/requests.service');

const gso = { id: '1', name: 'GSO Staff One', email: 'gso@invalid', roles: ['GSO_STAFF'] };
const requester = { id: '3', name: 'Requester One', email: 'requester@invalid', roles: ['BORROWER'] };

const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
const isoDate = (offsetDays) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const rejects = (promise, pattern, status) => assert.rejects(promise, (error) => {
  assert.match(error.message, pattern);
  if (status) assert.equal(error.status, status);
  return true;
});
const statusOf = async (id) => (await one('SELECT status FROM service_requests WHERE id = $1', [id])).status;
const historyOf = async (id) => (await pool.query(
  'SELECT new_status FROM service_request_history WHERE request_id = $1 ORDER BY id', [id],
)).rows.map((row) => row.new_status);
const assetOf = (requestId) => one(`SELECT id::TEXT AS id, to_char(due_date, 'YYYY-MM-DD') AS due_date, issued_at, returned_at, condition_out, condition_in
  FROM service_request_assets WHERE request_id = $1`, [requestId]);

const submit = (quantity) => requestsService.createRequest({
  requestType: 'BORROWING',
  formData: {
    items: [{ itemId: '3', quantity }],
    neededDate: isoDate(0),
    returnDate: isoDate(3),
    purpose: 'Classroom instruction',
    useLocation: 'Classroom',
    specificLocation: 'Room 101',
    returnResponsibleName: 'Requester One',
    returnResponsibleContact: '09171234567',
    remarks: '',
  },
}, requester);

const seed = `
  INSERT INTO users (id, name, email, password_hash) VALUES
    (1, 'GSO Staff One', 'gso@invalid', 'x'),
    (3, 'Requester One', 'requester@invalid', 'x');
  INSERT INTO item_catalog (id, item_code, category, description, category_id, item_name, unit_of_measure,
                            quantity, tracking_mode, issue_behavior, inventory_status, condition) VALUES
    (3, 'PRJ-1', 'Electronics', 'Projector', (SELECT min(id) FROM item_categories), 'Projector', 'unit', 10, 'quantity', 'returnable', 'Available', 'Good');
  INSERT INTO requester_identity_profiles (user_id, employee_code, department, position, contact_number, verification_status)
    VALUES (3, 'EMP-2', 'Registrar', 'Clerk', '09171234567', 'Verified');
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

test('approving a borrowing releases the item at once, with no pickup step', async () => {
  const request = await submit(2);
  assert.equal(request.status, 'Submitted');

  const updated = await requestsService.updateStatus(request.id, {
    status: 'Approved', dueDate: isoDate(3), conditionOut: 'New', note: 'Approved by GSO.',
  }, gso);

  assert.equal(updated.status, 'Issued');
  assert.deepEqual(await historyOf(request.id), ['Submitted', 'Approved', 'Issued']);
  const asset = await assetOf(request.id);
  assert.equal(asset.due_date, isoDate(3));
  assert.equal(asset.condition_out, 'New');
  assert.notEqual(asset.issued_at, null);
});

test('a second approval, or a stale one, is refused and changes nothing', async () => {
  const request = await submit(1);
  await requestsService.updateStatus(request.id, { status: 'Approved', dueDate: isoDate(2), conditionOut: 'Good' }, gso);
  await rejects(requestsService.updateStatus(request.id, { status: 'Approved', dueDate: isoDate(2) }, gso), /cannot change from Issued to Approved/, 409);
  assert.equal(await statusOf(request.id), 'Issued');
});

test('approval needs a return date from today onward, and a failed approval changes nothing', async () => {
  const late = await submit(1);
  await rejects(requestsService.updateStatus(late.id, { status: 'Approved', dueDate: isoDate(-1), conditionOut: 'Good' }, gso), /today or later/);
  assert.equal(await statusOf(late.id), 'Submitted');

  // Stock is checked when the request is sent and again at approval; more than is left is refused at sending.
  await rejects(submit(25), /Not enough stock of Projector. Available: \d+/, 409);
});

test('GSO inspects an item straight from Issued: damage needs a note and goes to repair', async () => {
  const request = await submit(1);
  await requestsService.updateStatus(request.id, { status: 'Approved', dueDate: isoDate(3), conditionOut: 'Good' }, gso);
  const asset = await assetOf(request.id);

  await rejects(requestsService.updateStatus(request.id, { status: 'For Repair', conditionsIn: { [asset.id]: 'Needs Repair' } }, gso), /Describe the damage/);
  assert.equal(await statusOf(request.id), 'Issued');

  const repaired = await requestsService.updateStatus(request.id, {
    status: 'For Repair', conditionsIn: { [asset.id]: 'Needs Repair' }, note: 'Lens cracked',
  }, gso);
  assert.equal(repaired.status, 'For Repair');
  const after = await assetOf(request.id);
  assert.equal(after.condition_in, 'Needs Repair');
  assert.notEqual(after.returned_at, null);
  const repairNotice = await one('SELECT message FROM app_notifications WHERE dedupe_key LIKE $1 ORDER BY id DESC LIMIT 1', [`requester-status:${request.id}:For Repair:%`]);
  assert.match(repairNotice.message, /GSO received Projector × 1 \(Needs Repair\) from you on .*sent for repair/);
});

test('a clean return closes the borrowing, whether the requester asked for it or GSO inspected it', async () => {
  const request = await submit(1);
  await requestsService.updateStatus(request.id, { status: 'Approved', dueDate: isoDate(3), conditionOut: 'Good' }, gso);
  await requestsService.requestReturn(request.id, requester);
  assert.equal(await statusOf(request.id), 'Return Requested');

  const asset = await assetOf(request.id);
  await rejects(requestsService.updateStatus(request.id, { status: 'Returned', conditionsIn: {} }, gso), /Choose the returned condition/);
  const returned = await requestsService.updateStatus(request.id, { status: 'Returned', conditionsIn: { [asset.id]: 'Good' } }, gso);
  assert.equal(returned.status, 'Returned');
  assert.equal((await assetOf(request.id)).condition_in, 'Good');
  // The requester's notice and the GSO audit entry both name the item and the condition recorded.
  const notice = await one('SELECT notification_type, message FROM app_notifications WHERE dedupe_key LIKE $1 ORDER BY id DESC LIMIT 1', [`requester-status:${request.id}:Returned:%`]);
  assert.equal(notice.notification_type, 'RETURN');
  assert.match(notice.message, /GSO received Projector × 1 \(Good\) from you on .*Your return is complete/);
  assert.match((await one("SELECT reason FROM inventory_change_logs WHERE request_id = $1 AND action = 'returned'", [request.id])).reason, /Borrowing returned: Projector × 1 \(Good\)/);
});

test('a returned borrowing is listed in the department\'s recent returns, linked to its request', async () => {
  const issuancesRepository = require('../src/modules/issuances/issuances.repository');
  const rows = await issuancesRepository.listMyDepartmentReturnActivity(requester.id);
  const row = rows.find((entry) => entry.source === 'BORROWING' && entry.itemName === 'Projector' && entry.status === 'Returned');
  assert.ok(row, 'the returned projector borrowing is listed');
  assert.equal(row.condition, 'Good');
  assert.equal(row.quantity, 1);
  assert.match(row.recipientLocation, /Classroom/);
  assert.notEqual(row.requestId, null);
});

test('an older borrowing waiting at Ready for Pickup can still be started', async () => {
  const request = await submit(1);
  await pool.query("UPDATE service_requests SET status = 'Ready for Pickup' WHERE id = $1", [request.id]);
  const started = await requestsService.updateStatus(request.id, { status: 'Issued', dueDate: isoDate(3), conditionOut: 'Good' }, gso);
  assert.equal(started.status, 'Issued');
});
