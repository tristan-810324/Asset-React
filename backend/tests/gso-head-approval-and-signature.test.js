// A GSO Head's approval goes through without a password step, and their saved signature can be read back.
// The database test needs an EMPTY database whose name ends in "_test"; it applies every migration and wipes it afterwards.
//
//   $env:TEST_DATABASE_URL = "postgres://postgres@127.0.0.1:55432/asset_test"
//   npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  test('GSO Head approval and signature test (set TEST_DATABASE_URL to an empty *_test database to run)', { skip: true }, () => {});
  return;
}
if (!new URL(testDatabaseUrl).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must point at a database whose name ends in "_test".');
}

Object.assign(process.env, {
  DATABASE_URL: testDatabaseUrl,
  JWT_SECRET: 'head-approval-signature-test-'.padEnd(40, 'x'),
  SMTP_HOST: '',
  SMTP_PORT: '',
  SMTP_USER: '',
  SMTP_PASS: '',
});
const pool = require('../src/config/db');
const requestsService = require('../src/modules/requests/requests.service');
const requestsRepository = require('../src/modules/requests/requests.repository');
const signaturesService = require('../src/modules/signatures/signatures.service');
const returnsService = require('../src/modules/issuances/returns.service');

const staff = { id: '1', name: 'GSO Staff One', email: 'staff@invalid', roles: ['GSO_STAFF'] };
const head = { id: '2', name: 'GSO Head One', email: 'head@invalid', roles: ['GSO_HEAD'] };
const lineByName = (request, name) => request.purchaseLines.find((line) => line.itemName === name);
const samplePng = fs.readFileSync(path.join(__dirname, '../src/assets/gso-logo.png'));

test.before(async () => {
  const { rows } = await pool.query("SELECT COUNT(*)::INTEGER AS tables FROM information_schema.tables WHERE table_schema = 'public'");
  if (rows[0].tables) throw new Error('The test database must be empty.');
  const migrationsDir = path.join(__dirname, '../database/migrations');
  for (const file of fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    await pool.query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  await pool.query(
    `INSERT INTO users (id, name, email, password_hash) VALUES
       (1, 'GSO Staff One', 'staff@invalid', 'x'), (2, 'GSO Head One', 'head@invalid', 'x'), (3, 'Requester One', 'requester@invalid', 'x')`,
  );
  await pool.query(`
    INSERT INTO item_catalog (id, item_code, category, description, category_id, item_name, unit_of_measure, quantity, tracking_mode, issue_behavior)
    SELECT 101, 'MOU-1', category.name, 'Mouse', category.id, 'Mouse', 'piece', 20, 'quantity', 'consumable'
      FROM item_categories AS category WHERE category.name = 'Computer Parts/ Peripherals'
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
const routeToHead = async () => {
  const submitted = await submit(['Mouse', 2]);
  const queued = await staffQueueEntry(submitted.id);
  await requestsService.staffReviewPurchaseRequisition(submitted.id, {
    action: 'ROUTE', routes: { ...routesFor(queued), [lineByName(queued, 'Mouse').id]: 'HEAD_ISSUE' },
  }, staff);
  return submitted;
};

test('the GSO Head approves the request without a password step', async () => {
  const submitted = await routeToHead();
  const { request } = await requestsService.reviewPurchaseRequisition(submitted.id, { action: 'DECIDE', decision: 'APPROVE' }, head);
  assert.equal(request.status, 'Approved');
  assert.equal(lineByName(request, 'Mouse').routeStatus, 'READY_FOR_STAFF');
});

test('a declined purchase item appears in the issuance records as Rejected, with its reason', async () => {
  const submitted = await routeToHead();
  await requestsService.reviewPurchaseRequisition(submitted.id, { action: 'DECIDE', decision: 'DECLINE', note: 'Hindi na kailangan.' }, head);
  const records = await returnsService.listIssuanceRecords({});
  const declined = records.find((record) => record.id.startsWith('requisition-') && record.itemName === 'Mouse' && record.decisionNote === 'Hindi na kailangan.');
  assert.ok(declined, 'the declined item is listed');
  assert.equal(declined.status, 'Rejected');
  assert.equal(declined.employeeName, 'Requester One');
  assert.match(declined.itemCode, /^REQ-/);
});

test('the GSO Head saves a PNG signature that is read back as a preview and a document image', async () => {
  const saved = await signaturesService.saveMySignature(head, `data:image/png;base64,${samplePng.toString('base64')}`);
  assert.equal(saved.width, 558);
  const preview = await signaturesService.getMySignature(head);
  assert.match(preview.imageDataUrl, /^data:image\/png;base64,/);
  const document = await signaturesService.getSignatureForDocument(head.id);
  assert.equal(document.sha256.length, 64);
  assert.ok(document.png.equals(samplePng));
});
