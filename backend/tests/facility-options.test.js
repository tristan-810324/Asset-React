// Tests for the Facility Use Permit lists, run against a real PostgreSQL database.
//
// They need an EMPTY database whose name ends in "_test". The tests apply every migration and drop the
// schema afterwards. They never send email.
//
//   $env:TEST_DATABASE_URL = "postgres://postgres@127.0.0.1:55432/asset_test"
//   node --test --test-concurrency=1 tests/facility-options.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  test('facility options (set TEST_DATABASE_URL to an empty *_test database to run)', { skip: true }, () => {});
  return;
}
if (!new URL(testDatabaseUrl).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must point at a database whose name ends in "_test".');
}

// Configure the app for the test database before any app module loads.
Object.assign(process.env, {
  DATABASE_URL: testDatabaseUrl,
  JWT_SECRET: 'facility-options-test-secret-'.padEnd(40, 'x'),
  SMTP_HOST: 'smtp.invalid',
  SMTP_PORT: '587',
  SMTP_USER: 'gso@invalid',
  SMTP_PASS: 'not-used',
});

const pool = require('../src/config/db');
const facilitiesService = require('../src/modules/facilities/facilities.service');

const labels = (venues) => venues.map((venue) => venue.label);

test.before(async () => {
  const { rows } = await pool.query("SELECT COUNT(*)::INTEGER AS tables FROM information_schema.tables WHERE table_schema = 'public'");
  if (rows[0].tables) throw new Error('The test database must be empty; it already has tables.');
  const migrationsDir = path.join(__dirname, '../database/migrations');
  for (const file of fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    await pool.query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
});

test.after(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.end();
});

test('the seeded venue list matches the permit form, with Others last', async () => {
  const venues = await facilitiesService.listVenues();
  assert.deepEqual(labels(venues), [
    'Annex Complex', 'Chapel', 'Comp. Lab', 'DMDY Complex', 'Magpili Hall',
    'Science Lab', 'Studio', 'The Sapientia Ideation Center Auditorium', 'Others',
  ]);
  const others = venues.at(-1);
  assert.equal(others.requiresDetail, true);
  assert.equal(others.detailLabel, 'Name of the venue');
  assert.equal(venues.find((venue) => venue.label === 'Chapel').requiresDetail, false);
});
