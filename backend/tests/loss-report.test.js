// Tests for the Loss / Damage Report: a requester can name only items issued to them and still out with them.
// The name and code are copied from the issuance record. They run against a real PostgreSQL database.
//
//   $env:TEST_DATABASE_URL = "postgres://postgres@127.0.0.1:55432/asset_test"
//   node --test --test-concurrency=1 tests/loss-report.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  test('loss report (set TEST_DATABASE_URL to an empty *_test database to run)', { skip: true }, () => {});
  return;
}
if (!new URL(testDatabaseUrl).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must point at a database whose name ends in "_test".');
}

Object.assign(process.env, {
  DATABASE_URL: testDatabaseUrl,
  JWT_SECRET: 'loss-report-test-secret-'.padEnd(40, 'x'),
  SMTP_HOST: 'smtp.invalid',
  SMTP_PORT: '587',
  SMTP_USER: 'gso@invalid',
  SMTP_PASS: 'not-used',
});
const nodemailer = require('nodemailer');
nodemailer.createTransport = () => ({ sendMail: async () => {} });

const pool = require('../src/config/db');
const requestsService = require('../src/modules/requests/requests.service');

const requester = { id: '3', name: 'Requester One', email: 'requester@invalid', roles: ['BORROWER'] };
const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
const rejects = (promise, pattern, status) => assert.rejects(promise, (error) => {
  assert.match(error.message, pattern);
  if (status) assert.equal(error.status, status);
  return true;
});
const yesterday = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const report = (items) => requestsService.createRequest({
  requestType: 'LOSS_DAMAGE_REPORT',
  formData: { incidentType: 'LOST', keyArea: 'Gym', incidentDate: yesterday(), responsiblePerson: 'Maria Cruz', items, remarks: 'Left after the event' },
}, requester);

// Requester 3 is linked to employee EMP-2 (Maria Cruz). Issuance 5 belongs to another employee.
const TAG_OUT_1 = 'AST-AAAAAAAAAAA01';
const TAG_OUT_2 = 'AST-AAAAAAAAAAA02';
const TAG_BACK = 'AST-AAAAAAAAAAA03';
const seed = `
  INSERT INTO users (id, name, email, password_hash) VALUES
    (1, 'GSO Staff One', 'gso@invalid', 'x'),
    (3, 'Requester One', 'requester@invalid', 'x');
  INSERT INTO employees (id, employee_code, department, last_name, first_name, position, email) VALUES
    (1, 'EMP-1', 'Academic Affairs', 'Lim', 'Jose', 'Clerk', 'jose@invalid'),
    (2, 'EMP-2', 'Registrar', 'Cruz', 'Maria', 'Clerk', 'maria@invalid');
  INSERT INTO item_catalog (id, item_code, category, description, category_id, item_name, unit_of_measure,
                            quantity, tracking_mode, issue_behavior, inventory_status, condition) VALUES
    (1, 'LAP-1', 'Electronics', 'Laptop', (SELECT min(id) FROM item_categories), 'Laptop', 'piece', 3, 'individual', 'returnable', 'Issued', 'Good'),
    (2, 'CHR-1', 'Furniture', 'Monoblock', (SELECT min(id) FROM item_categories), 'Monoblock', 'set', 10, 'quantity', 'returnable', 'Issued', 'Good'),
    (3, 'BOND-1', 'Office', 'Bond paper', (SELECT min(id) FROM item_categories), 'Bond paper', 'ream', 5, 'quantity', 'consumable', 'Issued', 'Good');
  INSERT INTO employee_issuance_batches (id, employee_id, token_hash, token_expires_at, status, requester_user_id) VALUES
    (1, 2, 'b1', NOW(), 'Issued', 3),
    (2, 1, 'b2', NOW(), 'Issued', NULL);
  INSERT INTO employee_issuances (id, employee_id, item_id, batch_id, token_expires_at, item_condition, quantity, returned_quantity, status, unit_of_measure) VALUES
    (1, 2, 1, 1, NOW(), 'Good', 3, 1, 'Issued', 'piece'),
    (2, 2, 2, 1, NOW(), 'Good', 6, 2, 'Issued', 'set'),
    (3, 2, 3, 1, NOW(), 'Good', 5, 0, 'Issued', 'ream'),
    (4, 2, 2, 1, NOW(), 'Good', 2, 2, 'Returned', 'set'),
    (5, 1, 2, 2, NOW(), 'Good', 4, 0, 'Issued', 'set');
  INSERT INTO asset_unit_tags (id, tag_code, item_id, unit_number, condition, custody_status, lifecycle_status,
                               issuance_id, assigned_employee_id, location) VALUES
    (1, '${TAG_OUT_1}', 1, 1, 'Good', 'Issued', 'Active', 1, 2, 'Registrar'),
    (2, '${TAG_OUT_2}', 1, 2, 'Good', 'Issued', 'Active', 1, 2, 'Registrar'),
    (3, '${TAG_BACK}', 1, 3, 'Good', 'Available', 'Active', 1, 2, 'GSO');
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

test('a report can name only items issued to the requester and still out with them', async () => {
  await rejects(report([{ issuanceId: '5', quantity: 1 }]), /not issued to you/, 409);
  await rejects(report([{ issuanceId: '4', quantity: 1 }]), /not issued to you/, 409);
  await rejects(report([{ issuanceId: '3', quantity: 1 }]), /used up/, 409);
  await rejects(report([{ issuanceId: '2', quantity: 5 }]), /only have 4 set/, 409);
  await rejects(report([{ issuanceId: '1', tagCode: TAG_BACK, quantity: 1 }]), /That unit is not issued to you/, 409);
  await rejects(report([{ issuanceId: '1', tagCode: TAG_OUT_1, quantity: 2 }]), /one at a time/, 400);
  await rejects(report([{ issuanceId: '1', tagCode: TAG_OUT_1, quantity: 1 }, { issuanceId: '1', tagCode: TAG_OUT_1, quantity: 1 }]), /only be reported once/, 400);
  await rejects(report([]), /Pick at least one item/, 400);
  await rejects(report([{ issuanceId: 'abc', quantity: 1 }]), /Pick the items issued to you/, 400);
});

test('the report stores the name and code from the issuance record, not from the form', async () => {
  const request = await report([
    { issuanceId: '1', tagCode: TAG_OUT_1, quantity: 1, remarks: 'Screen cracked' },
    { issuanceId: '1', tagCode: TAG_OUT_2, quantity: 1 },
    { issuanceId: '2', quantity: 3, remarks: 'Two chairs broke' },
  ]);
  const stored = (await one('SELECT form_data FROM service_requests WHERE id = $1', [request.id])).form_data.items;
  assert.deepEqual(stored, [
    { quantity: 1, description: 'Laptop', assetCode: TAG_OUT_1, remarks: 'Screen cracked', issuanceId: '1', unitOfMeasure: 'piece' },
    { quantity: 1, description: 'Laptop', assetCode: TAG_OUT_2, remarks: '', issuanceId: '1', unitOfMeasure: 'piece' },
    { quantity: 3, description: 'Monoblock', assetCode: 'CHR-1', remarks: 'Two chairs broke', issuanceId: '2', unitOfMeasure: 'set' },
  ]);
});
