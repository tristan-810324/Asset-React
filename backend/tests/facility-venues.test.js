// Tests for the Facility Use places GSO manages: adding, hiding and showing, and the audit log.
// They run against a real PostgreSQL database. They need an EMPTY database whose name ends in "_test".
// The tests apply every migration and drop the schema afterwards. They never send email.
//
//   $env:TEST_DATABASE_URL = "postgres://postgres@127.0.0.1:55432/asset_test"
//   node --test --test-concurrency=1 tests/facility-venues.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  test('facility venues (set TEST_DATABASE_URL to an empty *_test database to run)', { skip: true }, () => {});
  return;
}
if (!new URL(testDatabaseUrl).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must point at a database whose name ends in "_test".');
}

Object.assign(process.env, {
  DATABASE_URL: testDatabaseUrl,
  JWT_SECRET: 'facility-venues-test-secret-'.padEnd(40, 'x'),
  SMTP_HOST: 'smtp.invalid',
  SMTP_PORT: '587',
  SMTP_USER: 'gso@invalid',
  SMTP_PASS: 'not-used',
});

const pool = require('../src/config/db');
const facilitiesService = require('../src/modules/facilities/facilities.service');

const gso = { id: '1', name: 'GSO Staff One', email: 'gso@invalid', roles: ['GSO_STAFF'] };
const labels = (venues) => venues.map((venue) => venue.label);
const rejects = (promise, status) => assert.rejects(promise, (error) => error.status === status);

test.before(async () => {
  const { rows } = await pool.query("SELECT COUNT(*)::INTEGER AS tables FROM information_schema.tables WHERE table_schema = 'public'");
  if (rows[0].tables) throw new Error('The test database must be empty; it already has tables.');
  const migrationsDir = path.join(__dirname, '../database/migrations');
  for (const file of fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    await pool.query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  // The audit log records the GSO Staff account that made each change.
  await pool.query(`INSERT INTO users (id, name, email, password_hash, email_verified_at)
                    VALUES (1, 'GSO Staff One', 'gso@invalid', 'not-used', NOW())`);
});

test.after(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.end();
});

test('the seeded places match the permit form, with Others last', async () => {
  const venues = await facilitiesService.listVenues();
  assert.deepEqual(labels(venues), [
    'Annex Complex', 'Chapel', 'Comp. Lab', 'DMDY Complex', 'Magpili Hall',
    'Science Lab', 'Studio', 'The Sapientia Ideation Center Auditorium', 'Others',
  ]);
  assert.equal(venues.at(-1).detailLabel, 'Name of the venue');
});

test('GSO adds a place, and requesters see it before Others', async () => {
  const added = await facilitiesService.createVenue(gso, { label: '  Gym   Hall ', requiresDetail: false });
  assert.equal(added.label, 'Gym Hall');
  const names = labels(await facilitiesService.listVenues());
  assert.ok(names.includes('Gym Hall'));
  assert.equal(names.at(-1), 'Others');
});

test('a place already on the list is refused, ignoring case', async () => {
  await rejects(facilitiesService.createVenue(gso, { label: 'chapel', requiresDetail: false }), 409);
});

test('a place that asks requesters for details needs the question', async () => {
  await rejects(facilitiesService.createVenue(gso, { label: 'Projector Room', requiresDetail: true }), 400);
  const created = await facilitiesService.createVenue(gso, {
    label: 'Projector Room', requiresDetail: true, detailLabel: 'Which room?',
  });
  assert.equal(created.detailLabel, 'Which room?');
});

test('hiding a place takes it off the requester list, and GSO can show it again', async () => {
  const gym = (await facilitiesService.listManagedVenues()).find((venue) => venue.label === 'Gym Hall');
  await facilitiesService.updateVenue(gso, gym.id, { isActive: false });
  assert.equal(labels(await facilitiesService.listVenues()).includes('Gym Hall'), false);
  const managed = (await facilitiesService.listManagedVenues()).find((venue) => venue.id === gym.id);
  assert.equal(managed.isActive, false);

  await facilitiesService.updateVenue(gso, gym.id, { isActive: true });
  assert.equal(labels(await facilitiesService.listVenues()).includes('Gym Hall'), true);
});

test('renaming a place and changing its question is saved', async () => {
  const room = (await facilitiesService.listManagedVenues()).find((venue) => venue.label === 'Projector Room');
  const questioned = await facilitiesService.updateVenue(gso, room.id, { detailLabel: 'Which projector room exactly?' });
  assert.equal(questioned.detailLabel, 'Which projector room exactly?');

  const renamed = await facilitiesService.updateVenue(gso, room.id, { label: 'Projector Hall' });
  assert.equal(renamed.label, 'Projector Hall');
  assert.equal(labels(await facilitiesService.listVenues()).includes('Projector Hall'), true);

  await rejects(facilitiesService.updateVenue(gso, room.id, { detailLabel: '   ' }), 400);
});

test('unknown places, empty names, and empty changes are refused', async () => {
  await rejects(facilitiesService.updateVenue(gso, '999999', { isActive: false }), 404);
  await rejects(facilitiesService.updateVenue(gso, 'abc', { isActive: false }), 404);
  await rejects(facilitiesService.createVenue(gso, { label: '   ', requiresDetail: false }), 400);
  await rejects(facilitiesService.updateVenue(gso, '1', {}), 400);
});

test('renaming a place to a name already on the list is refused', async () => {
  const hall = (await facilitiesService.listManagedVenues()).find((venue) => venue.label === 'Projector Hall');
  await rejects(facilitiesService.updateVenue(gso, hall.id, { label: 'chapel' }), 409);
  assert.equal(labels(await facilitiesService.listVenues()).includes('Projector Hall'), true);
});

test('a place can be deleted, and it is gone from both lists', async () => {
  const gym = (await facilitiesService.listManagedVenues()).find((venue) => venue.label === 'Gym Hall');
  const removed = await facilitiesService.deleteVenue(gso, gym.id);
  assert.equal(removed.label, 'Gym Hall');
  assert.equal(labels(await facilitiesService.listVenues()).includes('Gym Hall'), false);
  assert.equal((await facilitiesService.listManagedVenues()).some((venue) => venue.id === gym.id), false);
  await rejects(facilitiesService.deleteVenue(gso, gym.id), 404);
});

test('each change is written to the audit log, and refused changes are not', async () => {
  const { rows } = await pool.query(
    "SELECT action FROM inventory_change_logs WHERE entity_type = 'facility_option' ORDER BY id",
  );
  // Added Gym Hall, added Projector Room, hid and showed Gym Hall, changed the Projector Room question and name,
  // then deleted Gym Hall. The refused rename and the refused duplicate are not in the log.
  assert.deepEqual(rows.map((row) => row.action), ['created', 'created', 'updated', 'updated', 'updated', 'updated', 'deleted']);
});
