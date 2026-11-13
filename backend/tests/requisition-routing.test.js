// Routing of purchase requisition items: GSO Staff check stock first, the GSO Head decides the rest.
//
// The rule tests always run. The database test needs an EMPTY database whose name ends in "_test";
// it applies every migration, seeds its own data, and wipes the database afterwards.
//
//   $env:TEST_DATABASE_URL = "postgres://postgres@127.0.0.1:55432/asset_test"
//   npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { staffRouteOptions, nextRequisitionStatus, nameMatch } = require('../src/modules/requests/requisition-routing');

test('in stock, GSO Staff issue or ask the GSO Head; a shortage needs purchase approval', () => {
  assert.deepEqual(staffRouteOptions({ requestedQuantity: 50, availableQuantity: 50 }), ['ISSUE', 'HEAD_ISSUE']);
  assert.deepEqual(staffRouteOptions({ requestedQuantity: 4, availableQuantity: 3 }), ['PURCHASE']);
  assert.deepEqual(staffRouteOptions({ requestedQuantity: 1, availableQuantity: 0 }), ['PURCHASE']);
});

test('the request status follows whose turn it is', () => {
  assert.equal(nextRequisitionStatus(['WAITING_STAFF_REVIEW', 'READY_FOR_STAFF'], 'Submitted'), 'Submitted');
  assert.equal(nextRequisitionStatus(['READY_FOR_STAFF', 'WAITING_GSO_HEAD'], 'Submitted'), 'Under Review');
  assert.equal(nextRequisitionStatus(['READY_FOR_STAFF', 'WAITING_FINANCE'], 'Under Review'), 'GSO Endorsed');
  assert.equal(nextRequisitionStatus(['READY_FOR_STAFF', 'REJECTED'], 'Under Review'), 'Approved');
  assert.equal(nextRequisitionStatus(['ISSUED', 'REJECTED'], 'Under Review'), 'Completed');
  assert.equal(nextRequisitionStatus(['REJECTED', 'REJECTED'], 'Under Review'), 'Rejected');
  assert.equal(nextRequisitionStatus(['READY_FOR_STAFF', 'NEEDS_INFORMATION'], 'Under Review'), 'Needs Information');
});

test('a delivery matches an inventory record by name: the same name, or a similar one staff must confirm', () => {
  assert.equal(nameMatch('Webcam', ' webcam '), 'EXACT');
  assert.equal(nameMatch('Webcam', 'USB Webcam 1080p'), 'SIMILAR');
  assert.equal(nameMatch('USB Webcam 1080p', 'Webcam'), 'SIMILAR');
  assert.equal(nameMatch('Hand-Sanitizer', 'Hand Sanitizer 500ml'), 'SIMILAR');
  assert.equal(nameMatch('Webcam', 'Keyboard'), null);
  assert.equal(nameMatch('USB Webcam', 'USB Keyboard'), null);
  assert.equal(nameMatch('Webcam', ''), null);
});

test('a purchase waits for GSO Staff to hand the signed PDF to Finance, never for a Finance reply', () => {
  assert.equal(nextRequisitionStatus(['READY_FOR_STAFF', 'WAITING_FOR_PURCHASE'], 'Sent to Finance'), 'Sent to Finance');
  assert.equal(nextRequisitionStatus(['READY_FOR_STAFF', 'WAITING_FINANCE'], 'Under Review'), 'GSO Endorsed');
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  test('requisition routing database test (set TEST_DATABASE_URL to an empty *_test database to run)', { skip: true }, () => {});
  return;
}
if (!new URL(testDatabaseUrl).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must point at a database whose name ends in "_test".');
}

// Configure the app for the test database before any app module loads. No email is sent.
Object.assign(process.env, {
  DATABASE_URL: testDatabaseUrl,
  JWT_SECRET: 'requisition-routing-test-'.padEnd(40, 'x'),
  SMTP_HOST: '',
  SMTP_PORT: '',
  SMTP_USER: '',
  SMTP_PASS: '',
});
const pool = require('../src/config/db');
const env = require('../src/config/env');
const requestsService = require('../src/modules/requests/requests.service');
const requestsRepository = require('../src/modules/requests/requests.repository');
const { getAvailableQuantity } = require('../src/modules/inventory/inventory.stock');

const staff = { id: '1', name: 'GSO Staff One', email: 'staff@invalid', roles: ['GSO_STAFF'] };
const head = { id: '2', name: 'GSO Head One', email: 'head@invalid', roles: ['GSO_HEAD'] };
const rejects = (promise, pattern, status) => assert.rejects(promise, (error) => {
  assert.match(error.message, pattern);
  assert.equal(error.status, status);
  return true;
});
const available = async (itemId) => getAvailableQuantity(pool, (await pool.query('SELECT id, quantity FROM item_catalog WHERE id = $1', [itemId])).rows[0]);
const lineByName = (request, name) => request.purchaseLines.find((line) => line.itemName === name);

test.before(async () => {
  assert.equal(env.smtp, null);
  const { rows } = await pool.query("SELECT COUNT(*)::INTEGER AS tables FROM information_schema.tables WHERE table_schema = 'public'");
  if (rows[0].tables) throw new Error('The test database must be empty; it already has tables.');
  const migrationsDir = path.join(__dirname, '../database/migrations');
  for (const file of fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    await pool.query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  await pool.query(`
    INSERT INTO users (id, name, email, password_hash) VALUES
      (1, 'GSO Staff One', 'staff@invalid', 'x'), (2, 'GSO Head One', 'head@invalid', 'x'), (3, 'Requester One', 'requester@invalid', 'x');
    INSERT INTO item_catalog (id, item_code, category, description, category_id, item_name, unit_of_measure, quantity, tracking_mode, issue_behavior)
    SELECT 101, 'MOU-1', category.name, 'Mouse', category.id, 'Mouse', 'piece', 20, 'quantity', 'consumable'
      FROM item_categories AS category WHERE category.name = 'Computer Parts/ Peripherals';
    INSERT INTO item_catalog (id, item_code, category, description, category_id, item_name, unit_of_measure, quantity, tracking_mode, issue_behavior)
    SELECT 102, 'LAP-1', category.name, 'Laptop', category.id, 'Laptop', 'unit', 3, 'quantity', 'returnable'
      FROM item_categories AS category WHERE category.name = 'Computer Parts/ Peripherals';
    INSERT INTO item_catalog (id, item_code, category, description, category_id, item_name, unit_of_measure, quantity, tracking_mode, issue_behavior)
    SELECT 103, 'WEB-1', category.name, 'Webcam', category.id, 'Webcam', 'piece', 1, 'quantity', 'returnable'
      FROM item_categories AS category WHERE category.name = 'Computer Parts/ Peripherals';
  `);
});

test.after(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.end();
});

const items = (...rows) => rows.map(([itemName, quantity]) => ({
  itemName, quantity, category: 'COMPUTER_PERIPHERALS', description: `${itemName} for the lab`, itemNameId: null, catalogItemId: null,
}));
const submit = (...rows) => requestsRepository.createRequest({
  requestType: 'PURCHASE_REQUISITION',
  formData: { purpose: 'Lab setup', requesterName: 'Requester One', requesterEmployeeCode: 'EMP-3', items: items(...rows) },
  userId: '3',
});
const staffQueueEntry = async (id) => (await requestsService.listStaffPurchaseRequisitions()).find((request) => request.id === id);
const routesFor = (request) => Object.fromEntries(request.purchaseLines.map((line) => [line.id, line.stockCheck.route]));

test('each item takes its own route, and the GSO Head decides only the items sent up', async () => {
  const submitted = await submit(['Mouse', 5], ['Laptop', 2], ['Webcam', 3]);
  assert.equal(submitted.status, 'Submitted');
  assert.ok(submitted.purchaseLines.every((line) => line.routeStatus === 'WAITING_STAFF_REVIEW'));

  const queued = await staffQueueEntry(submitted.id);
  assert.deepEqual(queued.purchaseLines.map((line) => line.stockCheck.options), [['ISSUE', 'HEAD_ISSUE'], ['ISSUE', 'HEAD_ISSUE'], ['PURCHASE']]);
  assert.equal(lineByName(queued, 'Webcam').stockCheck.reservedQuantity, 1);

  // An item without enough stock cannot be issued straight away.
  await rejects(requestsService.staffReviewPurchaseRequisition(submitted.id, {
    action: 'ROUTE', routes: { ...routesFor(queued), [lineByName(queued, 'Webcam').id]: 'ISSUE' },
  }, staff), /Nagbago ang stock ng Webcam/, 409);
  assert.equal(await available(101), 20);

  // The staff member issues the mice and asks the GSO Head about the laptops.
  const routes = { ...routesFor(queued), [lineByName(queued, 'Laptop').id]: 'HEAD_ISSUE' };
  const { request: routed } = await requestsService.staffReviewPurchaseRequisition(submitted.id, { action: 'ROUTE', routes, note: 'Para sa bagong lab.' }, staff);
  assert.equal(routed.status, 'Under Review');
  assert.equal(routed.staffReviewedBy, 'GSO Staff One');
  assert.deepEqual(routed.purchaseLines.map((line) => [line.routeStatus, line.reservedQuantity, line.financeQuantity]), [
    ['READY_FOR_STAFF', 5, 0],
    ['WAITING_GSO_HEAD', 2, 0],
    ['WAITING_GSO_HEAD', 1, 2],
  ]);
  assert.deepEqual([await available(101), await available(102), await available(103)], [15, 1, 0]);
  await rejects(requestsService.staffReviewPurchaseRequisition(submitted.id, { action: 'ROUTE', routes }, staff), /Na-review na/, 409);

  // Every waiting item needs a decision, and a decline needs a reason.
  const laptop = lineByName(routed, 'Laptop').id;
  const webcam = lineByName(routed, 'Webcam').id;
  await rejects(requestsService.reviewPurchaseRequisition(submitted.id, { action: 'DECIDE', decisions: [{ lineId: laptop, decision: 'APPROVE' }] }, head), /bawat item/, 409);
  await rejects(requestsService.reviewPurchaseRequisition(submitted.id, { action: 'DECIDE', decisions: [{ lineId: laptop, decision: 'DECLINE' }] }, head), /dahilan/, 400);

  const { request: decided } = await requestsService.reviewPurchaseRequisition(submitted.id, {
    action: 'DECIDE',
    decisions: [{ lineId: laptop, decision: 'DECLINE', note: 'May laptop pa ang department.' }, { lineId: webcam, decision: 'APPROVE' }],
  }, head);
  assert.equal(decided.status, 'GSO Endorsed');
  assert.deepEqual(decided.purchaseLines.map((line) => [line.routeStatus, line.reservedQuantity, line.financeQuantity]), [
    ['READY_FOR_STAFF', 5, 0],
    ['REJECTED', 0, 0],
    ['PARTIAL_STOCK', 1, 2],
  ]);
  assert.equal(await available(102), 3, 'a declined item gives its reserved stock back');
});

test('a reply to a staff question goes back to GSO Staff for a fresh stock check', async () => {
  const submitted = await submit(['Mouse', 2]);
  await rejects(requestsService.staffReviewPurchaseRequisition(submitted.id, { action: 'NEEDS_INFORMATION' }, staff), /detalye/, 400);
  const { request: asked } = await requestsService.staffReviewPurchaseRequisition(submitted.id, { action: 'NEEDS_INFORMATION', note: 'Anong model?' }, staff);
  assert.equal(asked.status, 'Needs Information');
  assert.equal(asked.purchaseLines[0].routeStatus, 'NEEDS_INFORMATION');

  const replied = await requestsRepository.respondToRequest({ id: submitted.id, userId: '3', message: 'Wireless.' });
  assert.equal(replied.status, 'Submitted');
  assert.equal(replied.purchaseLines[0].routeStatus, 'WAITING_STAFF_REVIEW');

  const queued = await staffQueueEntry(submitted.id);
  const { request: routed } = await requestsService.staffReviewPurchaseRequisition(submitted.id, { action: 'ROUTE', routes: routesFor(queued) }, staff);
  assert.equal(routed.status, 'Approved');
  assert.equal(routed.purchaseLines[0].routeStatus, 'READY_FOR_STAFF');
});

test('an in-stock item the GSO Head approves goes back to GSO Staff for issuance', async () => {
  const submitted = await submit(['Mouse', 2]);
  const queued = await staffQueueEntry(submitted.id);
  const mouse = queued.purchaseLines[0];
  const { request: asked } = await requestsService.staffReviewPurchaseRequisition(submitted.id, { action: 'ROUTE', routes: { [mouse.id]: 'HEAD_ISSUE' } }, staff);
  assert.equal(asked.status, 'Under Review');
  assert.deepEqual([asked.purchaseLines[0].routeStatus, asked.purchaseLines[0].reservedQuantity], ['WAITING_GSO_HEAD', 2]);

  const { request: approved } = await requestsService.reviewPurchaseRequisition(submitted.id, { action: 'DECIDE', decisions: [{ lineId: mouse.id, decision: 'APPROVE' }] }, head);
  assert.equal(approved.status, 'Approved');
  assert.equal(approved.purchaseLines[0].routeStatus, 'READY_FOR_STAFF');
});

// A requisition for an item nobody has in stock, taken through GSO Staff routing, GSO Head approval, and the
// printed physical handoff to Finance. Finance releases the funds outside the app, so nothing else is recorded.
async function sentToFinance(...rows) {
  const submitted = await submit(...rows);
  const queued = await staffQueueEntry(submitted.id);
  await requestsService.staffReviewPurchaseRequisition(submitted.id, { action: 'ROUTE', routes: routesFor(queued) }, staff);
  await requestsService.reviewPurchaseRequisition(submitted.id, {
    action: 'DECIDE', decisions: queued.purchaseLines.map((line) => ({ lineId: line.id, decision: 'APPROVE' })),
  }, head);
  const request = await requestsRepository.completePhysicalFinanceHandoff({ id: submitted.id, changedBy: '1' });
  return { id: submitted.id, lineId: request.purchaseLines[0].id, request };
}
const link = (receiptReference, ...deliveries) => requestsService.recordPurchaseDeliveries({
  receiptReference,
  deliveries: deliveries.map(([lineId, itemId, quantity, confirmSimilarName]) => ({ lineId, itemId, quantity, confirmSimilarName })),
}, staff);
const addInventory = (id, code, name, quantity, categoryName = 'Computer Parts/ Peripherals') => pool.query(
  `INSERT INTO item_catalog (id, item_code, category, description, category_id, item_name, unit_of_measure, quantity, tracking_mode, issue_behavior)
   SELECT $1, $2, category.name, $3, category.id, $3, 'piece', $4, 'quantity', 'consumable'
     FROM item_categories AS category WHERE category.name = $5`,
  [id, code, name, quantity, categoryName],
).then((result) => assert.equal(result.rowCount, 1));
const fresh = async (id) => (await requestsRepository.getById(null, id));

test('a bought item is linked after GSO Staff hands the signed requisition to Finance, with its receipt, staff account, and time', async () => {
  const submitted = await submit(['Webcam', 2]);
  const queued = await staffQueueEntry(submitted.id);
  assert.deepEqual(queued.purchaseLines[0].stockCheck.options, ['PURCHASE']);
  await requestsService.staffReviewPurchaseRequisition(submitted.id, { action: 'ROUTE', routes: routesFor(queued) }, staff);
  const webcam = queued.purchaseLines[0].id;
  const { request: approved } = await requestsService.reviewPurchaseRequisition(submitted.id, { action: 'DECIDE', decisions: [{ lineId: webcam, decision: 'APPROVE' }] }, head);
  assert.equal(approved.purchaseLines[0].routeStatus, 'WAITING_FINANCE');

  // Nothing can be linked before GSO Staff records the printed handoff to Finance.
  await rejects(link('OR-1001', [webcam, '103', 2]), /Hindi pa naihahand-off sa Finance/, 409);

  // GSO Staff hands the signed printed PDF to Finance. Finance gives the money outside the app, so nothing is waiting for a reply.
  const sent = await requestsRepository.completePhysicalFinanceHandoff({ id: submitted.id, changedBy: '1' });
  assert.equal(sent.status, 'Sent to Finance');
  assert.equal(sent.purchaseLines[0].routeStatus, 'WAITING_FOR_PURCHASE');

  // Until the bought units are in Item Master Data there is nothing to link.
  assert.deepEqual(await requestsService.listAwaitingPurchaseDeliveries({ itemIds: '103' }), []);
  await rejects(link('OR-1001', [webcam, '103', 2]), /Hindi sapat ang available na Webcam/, 409);
  await pool.query('UPDATE item_catalog SET quantity = quantity + 2 WHERE id = 103');
  const [waiting] = await requestsService.listAwaitingPurchaseDeliveries({});
  assert.deepEqual(
    { lineId: waiting.lineId, remaining: waiting.remainingQuantity, candidates: waiting.candidates.map((candidate) => [candidate.itemId, candidate.availableQuantity, candidate.match]) },
    { lineId: webcam, remaining: 2, candidates: [['103', 2, 'EXACT']] },
  );

  const [received] = await link('OR-1001', [webcam, '103', 2]);
  assert.equal(received.status, 'Approved');
  const line = received.purchaseLines[0];
  assert.deepEqual([line.routeStatus, line.reservedQuantity, line.financeQuantity], ['READY_FOR_STAFF', 2, 0]);
  assert.equal(line.receipts.length, 1);
  assert.deepEqual(
    { itemCode: line.receipts[0].itemCode, quantity: line.receipts[0].quantity, receiptReference: line.receipts[0].receiptReference, receivedBy: line.receipts[0].receivedBy },
    { itemCode: 'WEB-1', quantity: 2, receiptReference: 'OR-1001', receivedBy: 'GSO Staff One' },
  );
  assert.ok(line.receipts[0].receivedAt);
  assert.equal(await available(103), 0);

  // A mistake can be undone until the units are issued; the record stays for the audit trail.
  const undone = await requestsService.undoPurchaseDelivery(submitted.id, line.receipts[0].id, staff);
  assert.equal(undone.status, 'Sent to Finance');
  const reopened = undone.purchaseLines[0];
  assert.deepEqual([reopened.routeStatus, reopened.reservedQuantity, reopened.financeQuantity], ['WAITING_FOR_PURCHASE', 0, 2]);
  assert.deepEqual([reopened.receipts[0].voidedBy, Boolean(reopened.receipts[0].voidedAt)], ['GSO Staff One', true]);
  assert.equal(await available(103), 2);
  await rejects(requestsService.undoPurchaseDelivery(submitted.id, line.receipts[0].id, staff), /Na-undo na/, 409);

  const [again] = await link('OR-1002', [webcam, '103', 2]);
  assert.equal(again.status, 'Approved');
  assert.equal(again.purchaseLines[0].receipts.length, 2);

  // Once some of the units are issued, the delivery can no longer be undone.
  await pool.query('UPDATE purchase_requisition_line_allocations SET fulfilled_quantity = 1 WHERE line_id = $1', [webcam]);
  await rejects(requestsService.undoPurchaseDelivery(submitted.id, again.purchaseLines[0].receipts[1].id, staff), /Na-issue na/, 409);
});

test('one restock fills several requests at once, oldest first, and never more than the stock', async () => {
  const first = await sentToFinance(['Headset', 5]);
  const second = await sentToFinance(['Headset', 3]);
  const third = await sentToFinance(['Headset', 4]);
  await addInventory(104, 'HEA-1', 'Headset', 6);

  const waiting = await requestsService.listAwaitingPurchaseDeliveries({ itemIds: '104' });
  assert.deepEqual(waiting.map((entry) => [entry.requestId, entry.remainingQuantity]), [[first.id, 5], [second.id, 3], [third.id, 4]]);
  assert.ok(waiting.every((entry) => entry.candidates.length === 1 && entry.candidates[0].availableQuantity === 6));

  // 5 + 3 is more than the 6 in stock: nothing is saved.
  await rejects(link('OR-2001', [first.lineId, '104', 5], [second.lineId, '104', 3]), /Hindi sapat ang available na Headset/, 409);
  assert.equal((await fresh(first.id)).purchaseLines[0].routeStatus, 'WAITING_FOR_PURCHASE');
  assert.equal(await available(104), 6);

  // A partial delivery: the first request is filled, the second gets what is left and keeps waiting for the rest.
  const done = await link('OR-2001', [first.lineId, '104', 5], [second.lineId, '104', 1]);
  assert.deepEqual(done.map((request) => request.status), ['Approved', 'Sent to Finance']);
  const partial = done[1].purchaseLines[0];
  assert.deepEqual([partial.routeStatus, partial.reservedQuantity, partial.financeQuantity], ['PARTIAL_STOCK', 1, 2]);
  assert.deepEqual([done[0], done[1]].map((request) => request.purchaseLines[0].receipts[0].receiptReference), ['OR-2001', 'OR-2001']);
  assert.equal(await available(104), 0);

  // The next restock offers only the requests that still wait.
  await pool.query('UPDATE item_catalog SET quantity = quantity + 2 WHERE id = 104');
  const rest = await requestsService.listAwaitingPurchaseDeliveries({ itemIds: '104' });
  assert.deepEqual(rest.map((entry) => [entry.requestId, entry.remainingQuantity]), [[second.id, 2], [third.id, 4]]);
  const [completed] = await link('OR-2002', [second.lineId, '104', 2]);
  assert.equal(completed.status, 'Approved');
  assert.equal(completed.purchaseLines[0].receipts.length, 2);
});

test('two staff members cannot link the same units or the same item twice', async () => {
  const left = await sentToFinance(['Speaker', 4]);
  const right = await sentToFinance(['Speaker', 4]);
  await addInventory(108, 'SPK-1', 'Speaker', 4);

  // Two requests want the only 4 units, pressed at the same moment: one wins, the other is told the stock is gone.
  const race = await Promise.allSettled([link('OR-3001', [left.lineId, '108', 4]), link('OR-3002', [right.lineId, '108', 4])]);
  assert.equal(race.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  const lost = race.find((outcome) => outcome.status === 'rejected').reason;
  assert.equal(lost.status, 409);
  assert.match(lost.message, /Hindi sapat ang available na Speaker/);
  assert.equal(await available(108), 0);

  // Both staff record the same item with plenty of stock: the second one is told it was already linked.
  const same = await sentToFinance(['Speaker', 2]);
  await pool.query('UPDATE item_catalog SET quantity = quantity + 20 WHERE id = 108');
  const twice = await Promise.allSettled([link('OR-3003', [same.lineId, '108', 2]), link('OR-3004', [same.lineId, '108', 2])]);
  assert.equal(twice.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  assert.match(twice.find((outcome) => outcome.status === 'rejected').reason.message, /Na-link na ang delivery ng Speaker/);
  assert.equal((await fresh(same.id)).purchaseLines[0].receipts.length, 1);
});

test('a similar name needs the staff member to confirm it, and another category is never offered', async () => {
  const request = await sentToFinance(['Microphone', 2]);
  await addInventory(105, 'MIC-9', 'USB Microphone Pro', 3);
  await addInventory(106, 'MIC-OS', 'Microphone', 5, 'Office Supplies');
  await addInventory(107, 'KEY-1', 'Keyboard', 5);

  const waiting = (await requestsService.listAwaitingPurchaseDeliveries({})).find((entry) => entry.lineId === request.lineId);
  assert.deepEqual(waiting.candidates.map((candidate) => [candidate.itemCode, candidate.match]), [['MIC-9', 'SIMILAR']]);

  await rejects(link('', [request.lineId, '105', 2]), /Magkaiba ang pangalan ng "Microphone" at "USB Microphone Pro"/, 409);
  await rejects(link('', [request.lineId, '106', 2, true]), /Dapat tugma ang item name at category/, 409);
  await rejects(link('', [request.lineId, '107', 2, true]), /Dapat tugma ang item name at category/, 409);
  const [confirmed] = await link('', [request.lineId, '105', 2, true]);
  assert.equal(confirmed.status, 'Approved');
  assert.match(confirmed.history.at(-2).note, /Name confirmed by staff: "USB Microphone Pro" counted as "Microphone"/);
  assert.equal(confirmed.purchaseLines[0].receipts[0].receiptReference, '');
});
