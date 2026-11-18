// Tests for the staff-controlled Loss & Damage workflow.
//
//   $env:TEST_DATABASE_URL = "postgres://postgres@127.0.0.1:55432/asset_test"
//   node --test --test-concurrency=1 tests/loss-damage.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const testDatabaseUrl = process.env.TEST_DATABASE_URL || '';
if (testDatabaseUrl && !new URL(testDatabaseUrl).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must point at a database whose name ends in "_test".');
}

Object.assign(process.env, {
  DATABASE_URL: testDatabaseUrl || 'postgres://postgres@127.0.0.1:1/not_used',
  JWT_SECRET: 'loss-damage-test-secret-'.padEnd(40, 'x'),
  SMTP_HOST: '',
  SMTP_PORT: '',
  SMTP_USER: '',
  SMTP_PASS: '',
});

const lossDamage = require('../src/modules/loss-damage/loss-damage.service');
const pool = require('../src/config/db');
const requestsService = require('../src/modules/requests/requests.service');
const returnsRepository = require('../src/modules/issuances/returns.repository');

const databaseTest = (name, fn) => test(name, { skip: testDatabaseUrl ? false : 'set TEST_DATABASE_URL to an empty *_test database to run' }, fn);

const gso = { id: '1', name: 'GSO Staff One', email: 'gso@invalid', roles: ['GSO_STAFF'] };
const requester = { id: '3', name: 'Requester One', email: 'requester@invalid', roles: ['BORROWER'] };
const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
const rejects = (promise, pattern, status) => assert.rejects(promise, (error) => {
  assert.match(error.message, pattern);
  if (status) assert.equal(error.status, status);
  return true;
});

const seed = `
  INSERT INTO users (id, name, email, password_hash) VALUES
    (1, 'GSO Staff One', 'gso@invalid', 'x'),
    (3, 'Requester One', 'requester@invalid', 'x');
  INSERT INTO requester_identity_profiles (user_id, employee_code, first_name, last_name, department, position, contact_number, verification_status)
    VALUES (3, 'EMP-3', 'Ana', 'Reyes', 'Registrar', 'Clerk', '09171234567', 'Verified');
`;

test.before(async () => {
  if (!testDatabaseUrl) return;
  const { rows } = await pool.query("SELECT COUNT(*)::INTEGER AS tables FROM information_schema.tables WHERE table_schema = 'public'");
  if (rows[0].tables) throw new Error('The test database must be empty; it already has tables.');
  const migrationsDir = path.join(__dirname, '../database/migrations');
  for (const file of fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    await pool.query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  await pool.query(seed);
});

test.after(async () => {
  if (!testDatabaseUrl) return;
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.end();
});

async function newReport(id) {
  const form = {
    incidentType: 'LOST',
    keyArea: 'Gym',
    incidentDate: '2026-11-14',
    responsiblePerson: 'Ana Reyes',
    items: [{ quantity: 1, description: 'Laptop', assetCode: 'LAP-1', issuanceId: '1', unitOfMeasure: 'piece', remarks: '' }],
    remarks: 'Left after the event',
  };
  await pool.query(
    `INSERT INTO service_requests (id, reference_no, request_type, title, form_data, status, requested_by_user_id)
     VALUES ($1, $2, 'LOSS_DAMAGE_REPORT', 'Lost property report: Gym', $3::JSONB, 'Submitted', 3)`,
    [id, `REQ-2026-${id}`, JSON.stringify(form)],
  );
  return String(id);
}

const token = () => crypto.randomBytes(16).toString('hex');
let fixtureCount = 0;

// An item issued to the requester (Ana Reyes, user 3): barcode units when tracked by unit, otherwise a quantity.
async function issuedItem({ description, tracking, units = [], quantity = 1 }) {
  fixtureCount += 1;
  const n = fixtureCount;
  const category = await one('INSERT INTO item_categories (name) VALUES ($1) RETURNING id', [`Loss test category ${n}`]);
  const item = await one(
    `INSERT INTO item_catalog (item_code, item_name, description, category_id, category, tracking_mode, quantity)
     VALUES ($1, $2, $2, $3, $4, $5, $6) RETURNING id`,
    [`LDT-${n}`, description, category.id, `Loss test category ${n}`, tracking, quantity],
  );
  const employee = await one(
    `INSERT INTO employees (employee_code, first_name, last_name, department, "position", email)
     VALUES ($1, 'Ana', 'Reyes', 'Registrar', 'Clerk', $2) RETURNING id`,
    [`LDT-EMP-${n}`, `ana.reyes.${n}@invalid`],
  );
  const batch = await one(
    `INSERT INTO employee_issuance_batches (employee_id, requested_by_user_id, requester_user_id, status, token_hash, token_expires_at, decided_at)
     VALUES ($1, 1, 3, 'Issued', $2, NOW() + INTERVAL '1 day', NOW()) RETURNING id`,
    [employee.id, token()],
  );
  const issuance = await one(
    `INSERT INTO employee_issuances (batch_id, employee_id, item_id, requested_by_user_id, status, token_hash, token_expires_at,
                                     quantity, unit_of_measure, item_condition, decided_at)
     VALUES ($1, $2, $3, 1, 'Issued', $4, NOW() + INTERVAL '1 day', $5, 'piece', 'Good', NOW()) RETURNING id`,
    [batch.id, employee.id, item.id, token(), units.length || quantity],
  );
  const tagIds = [];
  for (const [index, code] of units.entries()) {
    const tag = await one(
      `INSERT INTO asset_unit_tags (tag_code, item_id, unit_number, condition, custody_status, lifecycle_status,
                                    issuance_id, assigned_employee_id, assigned_user_id)
       VALUES ($1, $2, $3, 'Good', 'Issued', 'Active', $4, $5, 3) RETURNING id`,
      [code, item.id, index + 1, issuance.id, employee.id],
    );
    tagIds.push(tag.id);
  }
  return { itemId: item.id, itemCode: `LDT-${n}`, issuanceId: issuance.id, tagIds };
}

async function reportWith(id, incidentType, items) {
  const form = { incidentType, keyArea: 'Lab', incidentDate: '2026-11-14', responsiblePerson: 'Ana Reyes', items, remarks: '' };
  await pool.query(
    `INSERT INTO service_requests (id, reference_no, request_type, title, form_data, status, requested_by_user_id)
     VALUES ($1, $2, 'LOSS_DAMAGE_REPORT', 'Loss test report', $3::JSONB, 'Submitted', 3)`,
    [id, `REQ-2026-${id}`, JSON.stringify(form)],
  );
  return String(id);
}

const historyNotes = async (id) => (await pool.query('SELECT note FROM service_request_history WHERE request_id = $1 ORDER BY id', [id])).rows.map((row) => row.note);

databaseTest('a no-charge decision closes the case immediately and exposes no payment setup fields', async () => {
  const id = await newReport(201);
  await lossDamage.startReview(id, gso);
  const result = await lossDamage.decide(id, { resolution: 'NO_CHARGE', reason: 'Item was found intact' }, gso);
  assert.equal(result.case.status, 'Closed');
  assert.equal(result.case.settlement.status, 'NO_CHARGE');
  assert.equal(result.case.settlement.resolution, 'NO_CHARGE');
  assert.ok(result.case.settlement.custodyResolvedAt instanceof Date);
  assert.equal(Object.hasOwn(result, 'setup'), false);
  assert.equal(Object.hasOwn(result, 'linkError'), false);
  await rejects(lossDamage.decide(id, { resolution: 'FOR_REPAIR', reason: 'Changed my mind' }, gso), /can no longer be changed/, 409);
  await rejects(lossDamage.closeCase(id, { handled: true }, gso), /already closed/, 409);

  const mine = await lossDamage.getMine(id, requester);
  assert.deepEqual(Object.keys(mine.settlement).sort(), [
    'assessedBy',
    'custodyResolutionSummary',
    'custodyResolvedAt',
    'decidedAt',
    'reason',
    'resolution',
    'status',
  ]);
});

databaseTest('for repair stays in progress until GSO confirms physical follow-up', async () => {
  const id = await newReport(202);
  await rejects(lossDamage.decide(id, { resolution: 'FOR_REPAIR', reason: 'Screen cracked' }, gso), /Start the review/, 409);
  await lossDamage.startReview(id, gso);
  await rejects(lossDamage.startReview(id, gso), /already under review/, 409);
  const decided = await lossDamage.decide(id, { resolution: 'FOR_REPAIR', reason: 'Screen cracked' }, gso);
  assert.equal(decided.case.status, 'In Progress');
  assert.equal(decided.case.settlement.status, 'FOR_REPAIR');
  assert.equal(decided.case.settlement.custodyResolvedAt, null);
  await rejects(lossDamage.closeCase(id, { note: 'Done' }, gso), /physical follow-up/, 400);
  const closed = await lossDamage.closeCase(id, { handled: true, note: 'Screen replaced' }, gso);
  assert.equal(closed.case.status, 'Closed');
  assert.equal(closed.case.settlement.status, 'FOR_REPAIR');
  assert.ok(closed.case.settlement.custodyResolvedAt instanceof Date);
});

databaseTest('no charge removes a damaged unit from requester custody atomically', async () => {
  const item = await issuedItem({ description: 'Printer', tracking: 'individual', units: ['PRN-DMG-1'] });
  const id = await reportWith(212, 'DAMAGED', [{ issuanceId: String(item.issuanceId), assetCode: 'PRN-DMG-1', quantity: 1, description: 'Printer', remarks: '' }]);
  await lossDamage.startReview(id, gso);
  const result = await lossDamage.decide(id, { resolution: 'NO_CHARGE', reason: 'Charge was waived by GSO' }, gso);
  assert.equal(result.case.status, 'Closed');
  assert.ok(result.case.settlement.custodyResolvedAt instanceof Date);

  const tag = await one('SELECT tag_code, custody_status, lifecycle_status, condition, location, issuance_id, assigned_employee_id FROM asset_unit_tags WHERE id = $1', [item.tagIds[0]]);
  assert.notEqual(tag.tag_code, 'PRN-DMG-1', 'the old barcode is retired, as on every return');
  assert.deepEqual(
    { custody_status: tag.custody_status, lifecycle_status: tag.lifecycle_status, condition: tag.condition, location: tag.location, issuance_id: tag.issuance_id, assigned_employee_id: tag.assigned_employee_id },
    { custody_status: 'Available', lifecycle_status: 'Active', condition: 'Unserviceable', location: 'To Be Repaired', issuance_id: null, assigned_employee_id: null },
  );
  assert.deepEqual(await one('SELECT returned_quantity, status FROM employee_issuances WHERE id = $1', [item.issuanceId]), { returned_quantity: 1, status: 'Returned' });
  const record = await one(
    `SELECT status, return_condition, asset_unit_tag_id::TEXT AS "tagId", quantity, settlement_status, repair_resolved_at
       FROM employee_issuance_returns WHERE issuance_id = $1`,
    [item.issuanceId],
  );
  assert.deepEqual(record, {
    status: 'Returned', return_condition: 'Unserviceable', tagId: String(item.tagIds[0]), quantity: 1, settlement_status: null, repair_resolved_at: null,
  });
  assert.ok((await historyNotes(id)).some((note) => /^GSO resolved reported item custody\. Moved out of the requester's holdings: Printer \(barcode PRN-DMG-1\) set aside in To Be Repaired as Unserviceable\.$/.test(note)));
  assert.equal((await one("SELECT COUNT(*)::INTEGER AS n FROM inventory_change_logs WHERE item_id = $1 AND request_id = $2 AND action = 'returned'", [item.itemId, id])).n, 1);

  const returnId = (await one('SELECT id FROM employee_issuance_returns WHERE issuance_id = $1', [item.issuanceId])).id;
  await returnsRepository.resolveReturnRepair({ returnId, outcome: 'Repaired', note: 'Printer fixed', userId: 1 });
  assert.deepEqual(await one('SELECT condition, location, custody_status FROM asset_unit_tags WHERE id = $1', [item.tagIds[0]]), {
    condition: 'Good', location: 'GSO Storage', custody_status: 'Available',
  });
});

databaseTest('for repair resolves a lost unit only when GSO closes the case, exactly once', async () => {
  const item = await issuedItem({ description: 'Tablet', tracking: 'individual', units: ['TAB-LOST-1'] });
  const id = await reportWith(213, 'LOST', [{ issuanceId: String(item.issuanceId), assetCode: 'TAB-LOST-1', quantity: 1, description: 'Tablet', remarks: '' }]);
  await lossDamage.startReview(id, gso);
  await lossDamage.decide(id, { resolution: 'FOR_REPAIR', reason: 'Physical assessment needed' }, gso);

  assert.deepEqual(await one('SELECT custody_status, lifecycle_status, issuance_id FROM asset_unit_tags WHERE id = $1', [item.tagIds[0]]), {
    custody_status: 'Issued', lifecycle_status: 'Active', issuance_id: String(item.issuanceId),
  });
  const closed = await lossDamage.closeCase(id, { handled: true, note: 'Tablet written off' }, gso);
  assert.equal(closed.case.status, 'Closed');

  const tag = await one('SELECT tag_code, custody_status, lifecycle_status, location, issuance_id, assigned_employee_id FROM asset_unit_tags WHERE id = $1', [item.tagIds[0]]);
  assert.deepEqual(tag, {
    tag_code: 'TAB-LOST-1', custody_status: 'Available', lifecycle_status: 'Disposed', location: 'Lost', issuance_id: null, assigned_employee_id: null,
  });
  assert.deepEqual(await one('SELECT quantity FROM item_catalog WHERE id = $1', [item.itemId]), { quantity: 0 });
  const record = await one(
    'SELECT status, return_condition, quantity, settlement_status, settled_at IS NOT NULL AS settled FROM employee_issuance_returns WHERE issuance_id = $1',
    [item.issuanceId],
  );
  assert.deepEqual(record, { status: 'Lost', return_condition: 'Lost', quantity: 1, settlement_status: 'Waived', settled: true });
  await rejects(lossDamage.closeCase(id, { handled: true }, gso), /already closed/, 409);
  assert.equal((await one('SELECT COUNT(*)::INTEGER AS n FROM employee_issuance_returns WHERE issuance_id = $1', [item.issuanceId])).n, 1);
});

databaseTest('quantity stock follows the same GSO resolution path', async () => {
  const item = await issuedItem({ description: 'Bond paper', tracking: 'quantity', quantity: 3 });
  const damaged = await reportWith(214, 'DAMAGED', [{ issuanceId: String(item.issuanceId), assetCode: item.itemCode, quantity: 2, description: 'Bond paper', remarks: '' }]);
  await lossDamage.startReview(damaged, gso);
  await lossDamage.decide(damaged, { resolution: 'NO_CHARGE', reason: 'Wear from approved use' }, gso);
  assert.deepEqual(await one('SELECT quantity, repair_quantity FROM item_catalog WHERE id = $1', [item.itemId]), { quantity: 3, repair_quantity: 2 });
  assert.deepEqual(await one('SELECT returned_quantity, status FROM employee_issuances WHERE id = $1', [item.issuanceId]), { returned_quantity: 2, status: 'Issued' });

  const lost = await reportWith(215, 'LOST', [{ issuanceId: String(item.issuanceId), assetCode: item.itemCode, quantity: 1, description: 'Bond paper', remarks: '' }]);
  await lossDamage.startReview(lost, gso);
  await lossDamage.decide(lost, { resolution: 'FOR_REPAIR', reason: 'Finalize loss record' }, gso);
  await lossDamage.closeCase(lost, { handled: true }, gso);
  assert.deepEqual(await one('SELECT quantity, repair_quantity FROM item_catalog WHERE id = $1', [item.itemId]), { quantity: 2, repair_quantity: 2 });
  assert.deepEqual(await one('SELECT returned_quantity, status FROM employee_issuances WHERE id = $1', [item.issuanceId]), { returned_quantity: 3, status: 'Returned' });
  const records = await one(
    "SELECT COUNT(*)::INTEGER AS n FROM employee_issuance_returns WHERE issuance_id = $1 AND status = 'Lost' AND settlement_status = 'Waived' AND quantity = 1",
    [item.issuanceId],
  );
  assert.equal(records.n, 1);
});

databaseTest('a historical resolved settlement can be closed without moving custody again', async () => {
  const item = await issuedItem({ description: 'Projector', tracking: 'individual', units: ['PRJ-HISTORY-1'] });
  const id = await reportWith(216, 'DAMAGED', [{ issuanceId: String(item.issuanceId), assetCode: 'PRJ-HISTORY-1', quantity: 1, description: 'Projector', remarks: '' }]);
  await pool.query("UPDATE service_requests SET status = 'In Progress' WHERE id = $1", [id]);
  await pool.query(
    `INSERT INTO loss_damage_settlements (
       request_id, resolution, reason, status, assessed_by_user_id, custody_resolved_at, custody_resolution_summary
     ) VALUES ($1, 'RESOLVED', 'Historical case', 'RESOLVED', 1, NOW(), 'Custody was resolved under the retired workflow.')`,
    [id],
  );
  const closed = await lossDamage.closeCase(id, { handled: true, note: 'Archived case reviewed' }, gso);
  assert.equal(closed.case.status, 'Closed');
  assert.deepEqual(await one('SELECT custody_status, lifecycle_status, issuance_id FROM asset_unit_tags WHERE id = $1', [item.tagIds[0]]), {
    custody_status: 'Issued', lifecycle_status: 'Active', issuance_id: String(item.issuanceId),
  });
  assert.equal((await one('SELECT COUNT(*)::INTEGER AS n FROM employee_issuance_returns WHERE issuance_id = $1', [item.issuanceId])).n, 0);
});

databaseTest('requester access is scoped and the generic status endpoint cannot decide a report', async () => {
  const id = await newReport(217);
  await rejects(requestsService.updateStatus(id, { status: 'Approved' }, gso), /Loss \/ damage reports are decided/, 409);
  await rejects(lossDamage.getMine(id, { id: '99', roles: ['BORROWER'] }), /Request not found/, 404);
});

databaseTest('fresh migrations expose the provider-neutral settlement schema', async () => {
  const columns = (await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'loss_damage_settlements'`,
  )).rows.map((row) => row.column_name);
  for (const column of ['custody_resolved_at', 'custody_resolved_by_user_id', 'custody_resolution_summary', 'legacy_settlement_metadata', 'facility_asset_ids']) {
    assert.ok(columns.includes(column), `expected ${column} in the settlement schema`);
  }
});
