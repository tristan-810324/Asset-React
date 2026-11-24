// Tests for the facilities and equipment request. Each equipment row is an Item Master record: the server copies the
// record's name, code, description and unit, and refuses items that cannot be borrowed for an event.
// They run against a real PostgreSQL database, the same way as borrowing-flow.test.js.
//
//   $env:TEST_DATABASE_URL = "postgres://postgres@127.0.0.1:55432/asset_test"
//   node --test --test-concurrency=1 tests/facility-request.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  test('facility request (set TEST_DATABASE_URL to an empty *_test database to run)', { skip: true }, () => {});
  return;
}
if (!new URL(testDatabaseUrl).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must point at a database whose name ends in "_test".');
}

Object.assign(process.env, {
  DATABASE_URL: testDatabaseUrl,
  JWT_SECRET: 'facility-request-test-secret-'.padEnd(40, 'x'),
  SMTP_HOST: 'smtp.invalid',
  SMTP_PORT: '587',
  SMTP_USER: 'gso@invalid',
  SMTP_PASS: 'not-used',
});
const nodemailer = require('nodemailer');
nodemailer.createTransport = () => ({ sendMail: async () => {} });

const pool = require('../src/config/db');
const requestsService = require('../src/modules/requests/requests.service');
const inventoryService = require('../src/modules/inventory/inventory.service');
const facilityFlow = require('../src/modules/requests/facility-flow.service');

const requester = { id: '3', name: 'Requester One', email: 'requester@invalid', roles: ['BORROWER'] };
const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
const storedEquipment = async (requestId) => (await one('SELECT form_data FROM service_requests WHERE id = $1', [requestId])).form_data.equipment;
const rejects = (promise, pattern, status) => assert.rejects(promise, (error) => {
  assert.match(error.message, pattern);
  if (status) assert.equal(error.status, status);
  return true;
});
const tomorrow = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const submit = (equipment, overrides = {}) => requestsService.createRequest({
  requestType: 'FACILITY_USE',
  formData: {
    departmentOrganization: 'Registrar',
    activity: 'Freshmen orientation',
    purpose: 'Orientation for new students',
    activityType: 'CURRICULAR',
    otherActivityType: '',
    date: tomorrow(),
    startTime: '08:00',
    endTime: '10:00',
    participants: '50',
    venue: 'Chapel',
    equipment,
    ...overrides,
  },
}, requester);

const seed = `
  INSERT INTO users (id, name, email, password_hash) VALUES
    (1, 'GSO Staff One', 'gso@invalid', 'x'),
    (2, 'GSO Staff Two', 'gso2@invalid', 'x'),
    (3, 'Requester One', 'requester@invalid', 'x');
  INSERT INTO item_catalog (id, item_code, category, description, category_id, item_name, unit_of_measure,
                            quantity, tracking_mode, issue_behavior, inventory_status, condition) VALUES
    (3, 'AST-OE-0001', 'Office Equipment', 'Chairs for facility use', (SELECT min(id) FROM item_categories), 'Chairs', 'pcs', 20, 'quantity', 'returnable', 'Available', 'Good'),
    (4, 'AST-OE-0002', 'Office Equipment', 'Bond paper, A4', (SELECT min(id) FROM item_categories), 'Bond paper', 'ream', 50, 'quantity', 'consumable', 'Available', 'Good'),
    (5, 'AST-OE-0003', 'Office Equipment', 'Laptop for seminars', (SELECT min(id) FROM item_categories), 'Laptop', 'pcs', 1, 'individual', 'returnable', 'Available', 'Good'),
    (6, 'AST-OE-0004', 'Office Equipment', 'Projector, LCD', (SELECT min(id) FROM item_categories), 'Projector', 'pcs', 3, 'quantity', 'returnable', 'Available', 'Needs Repair'),
    (7, 'AST-OE-0005', 'Office Equipment', 'White board for facility use', (SELECT min(id) FROM item_categories), 'White board', 'pcs', 0, 'quantity', 'returnable', 'Available', 'Good'),
    (8, 'AST-OE-0006', 'Office Equipment', 'Laptop for seminars', (SELECT min(id) FROM item_categories), 'Laptop', 'pcs', 1, 'individual', 'returnable', 'Available', 'Good');
  INSERT INTO requester_identity_profiles (user_id, employee_code, first_name, last_name, department, position, contact_number, verification_status)
    VALUES (3, 'EMP-3', 'Ana', 'Reyes', 'Registrar', 'Clerk', '09171234567', 'Verified');
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

test('a request completes while a missing item is still unsettled, and Finance keeps the row', async () => {
  const request = await submit([{ itemId: '3', quantity: 2 }]);
  const asset = await approveAndRelease(request);
  await requestsService.updateStatus(request.id, { status: 'Returned', returns: [{ assetId: asset.id, returned: 1, condition: 'Good' }] }, gso);
  await requestsService.updateStatus(request.id, { status: 'Completed' }, gso);

  const [saved] = await assetsOf(request.id);
  assert.equal(saved.settlement_status, 'Pending');
  const rows = (await facilityFlow.financeReport()).filter((row) => String(row.requestId) === String(request.id));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].lostQuantity, 1);
  assert.ok(rows[0].accountableName);
  // Finance settles it later; here the replacement puts the stock back so the next tests start clean.
  await facilityFlow.settleFacilityItem(request.id, asset.id, { status: 'Replaced', note: 'Same model returned' }, gso);
});

test('each equipment row keeps the Item Master record, not the text the form sends', async () => {
  const request = await submit([{ itemId: '3', quantity: 4, name: 'Typed by hand', unit: 'box' }]);
  assert.deepEqual(await storedEquipment(request.id), [{
    name: 'Chairs', description: 'Chairs for facility use', quantity: 4, unit: 'pcs', itemCode: 'AST-OE-0001', itemId: '3',
  }]);
});

test('a request with no equipment is still valid, and the requester is told it was submitted', async () => {
  const request = await submit([]);
  assert.deepEqual(await storedEquipment(request.id), []);
  assert.equal((await one("SELECT COUNT(*)::INTEGER AS n FROM app_notifications WHERE recipient_user_id = 3 AND title = 'Request submitted' AND href = $1", [`/requester/requests/${request.id}`])).n, 1);
  assert.equal((await requestsService.getForGso(request.id)).requesterFullName, 'Ana Reyes', 'GSO sees the first and last name, not the account name');
});

test('the form keeps one participant count, which is optional and must be a whole number of at least 1', async () => {
  const request = await submit([]);
  assert.equal((await one('SELECT form_data FROM service_requests WHERE id = $1', [request.id])).form_data.participants, 50);
  assert.ok(await submit([], { participants: '' }), 'the count can be left out');
  await rejects(submit([], { participants: '0' }), /number of participants/, 400);
  await rejects(submit([], { participants: '12.5' }), /number of participants/, 400);
});

test('an item that cannot be borrowed for an event is refused', async () => {
  await rejects(submit([{ itemId: '4', quantity: 1 }]), /cannot be borrowed/, 409);
});

test('an item that is not in the Item Master is refused', async () => {
  await rejects(submit([{ itemId: '999', quantity: 1 }]), /no longer in the Item Master/, 400);
});

test('the same item cannot be listed twice, and quantity must be a whole number of at least 1', async () => {
  await rejects(submit([{ itemId: '3', quantity: 1 }, { itemId: '3', quantity: 2 }]), /listed once/, 400);
  await rejects(submit([{ itemId: '3', quantity: 0 }]), /whole number/, 400);
});

const gso = { id: '1', name: 'GSO Staff One', email: 'gso@invalid', roles: ['GSO_STAFF'] };
const stockOf = async (itemCode) => (await requestsService.listAssets({ includeUnstocked: true }))
  .find((asset) => asset.itemCode === itemCode).availableQuantity;
// The Item Master list (inventory.service) must agree with the requests list.
const itemMasterAvailable = async (itemCode) => (await inventoryService.listItems())
  .find((item) => item.itemCode === itemCode).availableQuantity;

const otherGso = { id: '2', name: 'GSO Staff Two', email: 'gso2@invalid', roles: ['GSO_STAFF'] };
const assetsOf = async (requestId) => (await pool.query('SELECT * FROM service_request_assets WHERE request_id = $1 ORDER BY id', [requestId])).rows;
const approveAndRelease = async (request) => {
  await requestsService.updateStatus(request.id, { status: 'Approved' }, gso);
  await requestsService.updateStatus(request.id, { status: 'Issued' }, gso);
  return (await assetsOf(request.id))[0];
};

test('approval reserves the items, release keeps them out, and the return gives them back', async () => {
  const request = await submit([{ itemId: '3', quantity: 5 }]);
  await requestsService.updateStatus(request.id, { status: 'Approved' }, gso);
  assert.equal(await stockOf('AST-OE-0001'), 15);
  assert.equal(await itemMasterAvailable('AST-OE-0001'), 15);
  await rejects(requestsService.updateStatus(request.id, { status: 'Completed' }, gso), /Release and return the items/, 409);

  await requestsService.updateStatus(request.id, { status: 'Issued' }, gso);
  const [asset] = await assetsOf(request.id);
  assert.ok(asset.issued_at);
  assert.equal(await itemMasterAvailable('AST-OE-0001'), 15);

  await requestsService.updateStatus(request.id, { status: 'Returned', returns: [{ assetId: asset.id, returned: 5, condition: 'Good' }] }, gso);
  assert.equal(await stockOf('AST-OE-0001'), 20);
  assert.equal(await itemMasterAvailable('AST-OE-0001'), 20);
  assert.equal((await one('SELECT status FROM service_requests WHERE id = $1', [request.id])).status, 'Completed', 'everything is back, so it closes by itself');
});

test('a request without items is Completed at approval and has nothing to release', async () => {
  const request = await submit([]);
  await requestsService.updateStatus(request.id, { status: 'Approved' }, gso);
  assert.equal((await one('SELECT status FROM service_requests WHERE id = $1', [request.id])).status, 'Completed');
  await rejects(requestsService.updateStatus(request.id, { status: 'Issued' }, gso), /cannot change/, 409);
});

test('a damaged return is saved as For Repair and keeps the items out until it is fixed', async () => {
  const request = await submit([{ itemId: '3', quantity: 2 }]);
  const asset = await approveAndRelease(request);
  const returns = [{ assetId: asset.id, returned: 2, condition: 'Needs Repair', repairBy: 'GSO' }];
  await rejects(requestsService.updateStatus(request.id, { status: 'Returned', returns }, gso), /For Repair/, 409);
  await requestsService.updateStatus(request.id, { status: 'For Repair', returns }, gso);
  assert.equal(await stockOf('AST-OE-0001'), 18);
  await requestsService.updateStatus(request.id, { status: 'Returned' }, gso);
  assert.equal(await stockOf('AST-OE-0001'), 20);
  assert.equal((await one('SELECT status FROM service_requests WHERE id = $1', [request.id])).status, 'Completed');
});

test('a return records how many came back, how many are damaged, and how many are missing', async () => {
  const request = await submit([{ itemId: '3', quantity: 5 }]);
  const asset = await approveAndRelease(request);
  const line = (change) => ({ assetId: asset.id, returned: 4, damaged: 1, condition: 'Needs Repair', repairBy: 'GSO', ...change });
  await rejects(requestsService.updateStatus(request.id, { status: 'For Repair', returns: [line({ damaged: 5 })] }, gso), /0 to 4/, 400);
  await rejects(requestsService.updateStatus(request.id, { status: 'For Repair', returns: [line({ condition: 'Good' })] }, gso), /what is wrong/, 400);
  await rejects(requestsService.updateStatus(request.id, { status: 'Returned', returns: [line()] }, gso), /For Repair/, 409);
  await requestsService.updateStatus(request.id, { status: 'For Repair', returns: [line()] }, gso);

  const [saved] = await assetsOf(request.id);
  assert.deepEqual([saved.returned_quantity, saved.damaged_quantity, saved.lost_quantity, saved.condition_in, saved.settlement_status], [4, 1, 1, 'Needs Repair', 'Pending']);
  await requestsService.updateStatus(request.id, { status: 'Returned' }, gso);
  await facilityFlow.settleFacilityItem(request.id, asset.id, { status: 'Replaced' }, otherGso);
  assert.equal(await stockOf('AST-OE-0001'), 20);
  await requestsService.updateStatus(request.id, { status: 'Completed' }, gso);
});

test('a missing item leaves the stock, blocks equipment requests, and any GSO staff member can settle it', async () => {
  const request = await submit([{ itemId: '3', quantity: 4 }]);
  const asset = await approveAndRelease(request);
  await rejects(requestsService.updateStatus(request.id, { status: 'Returned', returns: [{ assetId: asset.id, returned: 5, condition: 'Good' }] }, gso), /0 to 4/, 400);
  await requestsService.updateStatus(request.id, { status: 'Returned', returns: [{ assetId: asset.id, returned: 3, condition: 'Good' }] }, gso);

  const [saved] = await assetsOf(request.id);
  assert.equal(saved.returned_quantity, 3);
  assert.equal(saved.lost_quantity, 1);
  assert.equal(saved.settlement_status, 'Pending');
  assert.equal(await itemMasterAvailable('AST-OE-0001'), 19);
  assert.equal((await one("SELECT COUNT(*)::INTEGER AS n FROM inventory_change_logs WHERE flag = 'ITEM_LOST' AND request_id = $1", [request.id])).n, 1);
  assert.equal((await one("SELECT COUNT(*)::INTEGER AS n FROM app_notifications WHERE recipient_user_id = 3 AND title = 'Missing items' AND href = $1", [`/requester/requests/${request.id}`])).n, 1);

  const report = await facilityFlow.financeReport();
  assert.ok(report.some((row) => String(row.requestId) === String(request.id) && row.lostQuantity === 1 && row.accountableName), 'Finance report names the requester');
  assert.ok(await submit([{ itemId: '3', quantity: 1 }]), 'a missing item does not block new equipment requests');

  await rejects(facilityFlow.settleFacilityItem(request.id, asset.id, { status: 'Waived' }, gso), /reason for the waiver/, 400);
  // gso recorded this return and can still settle it.
  await facilityFlow.settleFacilityItem(request.id, asset.id, { status: 'Replaced', note: 'Same model returned' }, gso);
  assert.equal(await itemMasterAvailable('AST-OE-0001'), 20);
  await rejects(facilityFlow.settleFacilityItem(request.id, asset.id, { status: 'Paid' }, otherGso), /already settled/, 409);
  // The last settlement closes the request (the controller calls this after each settlement).
  await requestsService.completeFacilityIfSettled(await requestsService.getForGso(request.id), gso);
  assert.equal((await one('SELECT status FROM service_requests WHERE id = $1', [request.id])).status, 'Completed');
});

test('a released item past its end time gets one reminder a day until it is returned', async () => {
  const request = await submit([{ itemId: '3', quantity: 1 }]);
  const asset = await approveAndRelease(request);
  await pool.query(`UPDATE service_requests SET form_data = form_data || '{"date": "2000-01-01", "endTime": "10:00"}'::JSONB WHERE id = $1`, [request.id]);
  assert.equal(await facilityFlow.sendFacilityOverdueReminders(), 1);
  assert.equal(await facilityFlow.sendFacilityOverdueReminders(), 0, 'no second reminder within 23 hours');
  assert.equal((await one("SELECT COUNT(*)::INTEGER AS n FROM app_notifications WHERE recipient_user_id = 3 AND title = 'Items overdue'")).n, 1);
  await requestsService.updateStatus(request.id, { status: 'Returned', returns: [{ assetId: asset.id, returned: 1, condition: 'Good' }] }, gso);
  await pool.query('UPDATE service_requests SET overdue_reminded_at = NULL WHERE id = $1', [request.id]);
  assert.equal(await facilityFlow.sendFacilityOverdueReminders(), 0, 'a returned request is never reminded');
});

test('a slip is recorded once when printed, and a reprint needs a reason', async () => {
  const request = await submit([{ itemId: '3', quantity: 1 }]);
  await requestsService.updateStatus(request.id, { status: 'Approved' }, gso);
  await rejects(facilityFlow.reprintSlip(request.id, { reason: 'Printer error' }, gso), /cannot be reprinted/, 409);
  const printed = await facilityFlow.recordSlipPrints({ requestIds: [request.id] }, gso);
  assert.deepEqual(printed.map((row) => row.id), [String(request.id)]);
  const [first] = (await pool.query('SELECT slip_printed_at FROM service_requests WHERE id = $1', [request.id])).rows;
  await facilityFlow.recordSlipPrints({ requestIds: [request.id] }, otherGso);
  const [second] = (await pool.query('SELECT slip_printed_at, slip_printed_by_user_id FROM service_requests WHERE id = $1', [request.id])).rows;
  assert.equal(second.slip_printed_at.getTime(), first.slip_printed_at.getTime());
  assert.equal(String(second.slip_printed_by_user_id), '1');
  await rejects(facilityFlow.reprintSlip(request.id, { reason: 'Other' }, gso), /short reason/, 400);
  await facilityFlow.reprintSlip(request.id, { reason: 'Printer error' }, gso);
  assert.equal((await one("SELECT COUNT(*)::INTEGER AS n FROM inventory_change_logs WHERE flag = 'LABEL_REPRINT' AND request_id = $1", [request.id])).n, 1);

  await requestsService.updateStatus(request.id, { status: 'Issued' }, gso);
  const [asset] = await assetsOf(request.id);
  await requestsService.updateStatus(request.id, { status: 'Returned', returns: [{ assetId: asset.id, returned: 1, condition: 'Good' }] }, gso);
  assert.equal((await one('SELECT status FROM service_requests WHERE id = $1', [request.id])).status, 'Completed');
});

test('a slip number typed instead of scanned needs a reason and is flagged in the audit log', async () => {
  const request = await submit([{ itemId: '3', quantity: 1 }]);
  await requestsService.updateStatus(request.id, { status: 'Approved' }, gso);
  await rejects(requestsService.updateStatus(request.id, { status: 'Issued', entryMethod: 'typed' }, gso), /typed instead of scanned/, 400);
  await requestsService.updateStatus(request.id, { status: 'Issued', entryMethod: 'typed', typedReason: 'Scanner not working' }, gso);
  const flagged = await one("SELECT COUNT(*)::INTEGER AS n, MAX(reason) AS reason FROM inventory_change_logs WHERE flag = 'MANUAL_ENTRY' AND request_id = $1", [request.id]);
  assert.equal(flagged.n, 1);
  assert.match(flagged.reason, /Slip number typed, not scanned\. Reason: Scanner not working/);

  const [asset] = await assetsOf(request.id);
  await requestsService.updateStatus(request.id, { status: 'Returned', entryMethod: 'scan', returns: [{ assetId: asset.id, returned: 1, damaged: 0, condition: 'Good' }] }, gso);
  assert.equal((await one("SELECT COUNT(*)::INTEGER AS n FROM inventory_change_logs WHERE flag = 'MANUAL_ENTRY' AND request_id = $1", [request.id])).n, 1, 'a scanned return is not flagged');
  assert.equal((await one('SELECT status FROM service_requests WHERE id = $1', [request.id])).status, 'Completed');
});

test('a released venue stays booked, so the same slot cannot be approved twice', async () => {
  const first = await submit([{ itemId: '3', quantity: 1 }]);
  const asset = await approveAndRelease(first);
  const second = await submit([]);
  await rejects(requestsService.updateStatus(second.id, { status: 'Approved' }, gso), /approved request already exists/, 409);
  await requestsService.updateStatus(first.id, { status: 'Returned', returns: [{ assetId: asset.id, returned: 1, condition: 'Good' }] }, gso);
  assert.equal((await one('SELECT status FROM service_requests WHERE id = $1', [first.id])).status, 'Completed');
});

test('a request for more than the stock is refused when it is sent, and at approval if the stock dropped since', async () => {
  await rejects(submit([{ itemId: '3', quantity: 25 }]), /Not enough stock of Chairs\. Available: 20/, 409);
  const request = await submit([{ itemId: '3', quantity: 15 }]);
  await pool.query('UPDATE item_catalog SET quantity = 10 WHERE id = 3');
  try {
    await rejects(requestsService.updateStatus(request.id, { status: 'Approved' }, gso), /Not enough stock of Chairs\. Available: 10/, 409);
  } finally {
    await pool.query('UPDATE item_catalog SET quantity = 20 WHERE id = 3');
  }
});

test('an individually tracked item can be borrowed for an event', async () => {
  const request = await submit([{ itemId: '5', quantity: 1 }]);
  assert.deepEqual(await storedEquipment(request.id), [{
    name: 'Laptop', description: 'Laptop for seminars', quantity: 1, unit: 'pcs', itemCode: 'AST-OE-0003', itemId: '5',
  }]);
});

test('an individually tracked model takes one record per unit, and is refused when the units run out', async () => {
  const request = await submit([{ itemId: '5', quantity: 2 }]);
  assert.deepEqual((await storedEquipment(request.id)).map((row) => [row.itemId, row.quantity, row.itemCode]), [['5', 1, 'AST-OE-0003'], ['8', 1, 'AST-OE-0006']]);
  await rejects(submit([{ itemId: '5', quantity: 3 }]), /Not enough stock of Laptop\. Available: 2/, 409);
});

test('an item under repair is refused', async () => {
  await rejects(submit([{ itemId: '6', quantity: 1 }]), /cannot be borrowed/, 409);
});

test('an item never stocked is listed for the facilities request only, and an item under repair is never listed', async () => {
  const facilityList = await requestsService.listAssets({ includeUnstocked: true });
  const usualList = await requestsService.listAssets();
  assert.ok(facilityList.some((asset) => asset.itemCode === 'AST-OE-0005'));
  assert.ok(!usualList.some((asset) => asset.itemCode === 'AST-OE-0005'));
  assert.ok(!facilityList.some((asset) => asset.itemCode === 'AST-OE-0004'));
});

test('a Paid settlement keeps the missing unit out of stock', async () => {
  const request = await submit([{ itemId: '5', quantity: 1 }]);
  const asset = await approveAndRelease(request);
  await requestsService.updateStatus(request.id, { status: 'Returned', returns: [{ assetId: asset.id, returned: 0, condition: 'Good' }] }, gso);
  assert.equal(await itemMasterAvailable('AST-OE-0003'), 0);
  await facilityFlow.settleFacilityItem(request.id, asset.id, { status: 'Paid', note: 'OR 12345' }, otherGso);
  assert.equal(Number((await one('SELECT quantity FROM item_catalog WHERE id = 5')).quantity), 0);
  await requestsService.updateStatus(request.id, { status: 'Completed' }, gso);
});

test('a Needs Repair return must say who repairs it, and the choice is saved', async () => {
  // Afternoon slot, so it does not clash with the earlier morning bookings in this file.
  const request = await submit([{ itemId: '3', quantity: 3 }], { startTime: '13:00', endTime: '15:00' });
  const asset = await approveAndRelease(request);
  await rejects(requestsService.updateStatus(request.id, { status: 'For Repair', returns: [{ assetId: asset.id, returned: 3, damaged: 1, condition: 'Needs Repair' }] }, gso), /Choose who repairs/, 400);
  await requestsService.updateStatus(request.id, { status: 'For Repair', returns: [{ assetId: asset.id, returned: 3, damaged: 1, condition: 'Needs Repair', repairBy: 'ITSS' }] }, gso);
  const [saved] = await assetsOf(request.id);
  assert.equal(saved.repair_owner, 'ITSS');
  // The Finance report and To Be Repaired read this same owner.
  const report = await facilityFlow.financeReport();
  assert.equal(report.find((row) => String(row.requestId) === String(request.id)).repairOwner, 'ITSS');
});

test('GSO splits a Needs Repair row: some units repaired, the rest unserviceable, and the request closes after the last unit', async () => {
  const start = await stockOf('AST-OE-0001');
  const request = await submit([{ itemId: '3', quantity: 2 }], { startTime: '16:00', endTime: '17:00' });
  const asset = await approveAndRelease(request);
  await requestsService.updateStatus(request.id, { status: 'For Repair', returns: [{ assetId: asset.id, returned: 2, condition: 'Needs Repair', repairBy: 'GSO' }] }, gso);
  assert.equal(await stockOf('AST-OE-0001'), start - 2);
  await requestsService.resolveFacilityRepair(asset.id, { repaired: 1 }, gso);
  assert.equal((await one('SELECT status FROM service_requests WHERE id = $1', [request.id])).status, 'For Repair', 'one unit is still waiting');
  await rejects(requestsService.resolveFacilityRepair(asset.id, { repaired: 2 }, gso), /more than the units/, 409);
  await requestsService.resolveFacilityRepair(asset.id, { unserviceable: 1 }, gso);
  assert.equal(await stockOf('AST-OE-0001'), start);
  const [saved] = await assetsOf(request.id);
  assert.deepEqual([saved.repaired_quantity, saved.unserviceable_quantity], [1, 1]);
  assert.equal((await one('SELECT status FROM service_requests WHERE id = $1', [request.id])).status, 'Completed');
});
