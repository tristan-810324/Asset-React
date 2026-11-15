// Applies database/migrations in order and records each file in schema_migrations.
//
//   $env:MIGRATION_DATABASE_URL = "<direct PostgreSQL or Neon connection string>"
//   npm run db:migrate
//
// A new, empty database gets every file. A database that already has tables but no ledger, such as a
// restored copy of the local database, is refused. Say which migration it already includes, then run the rest:
//
//   npm run db:migrate -- --baseline=007
//
// Files 001 to 007 are the consolidated schema. A database migrated with the 29 pre-consolidation files
// (kept in database/migrations_archive/pre-consolidation-2026-11-15) already has that schema, so the runner
// records 001 to 007 as already included. A database with only part of that history is refused, and nothing
// is changed. Later migrations (008 and up) are applied in order.
//
// This script never reads backend/.env, so it cannot touch the local database by accident.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const migrationsDir = path.resolve(__dirname, '../database/migrations');
const retiredDir = path.resolve(__dirname, '../database/migrations_archive/pre-consolidation-2026-11-15');
// The last consolidated file. Files up to this number describe the schema of the retired history.
const CONSOLIDATED_VERSION = 7;

function migrationVersion(fileName) {
  return Number(fileName.match(/^(\d+)_/)[1]);
}

function listSqlFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((fileName) => /^\d+_.+\.sql$/.test(fileName))
    .sort((left, right) => migrationVersion(left) - migrationVersion(right));
}

function readBaselineVersion() {
  const argument = process.argv.slice(2).find((value) => value.startsWith('--baseline='));
  if (!argument) return null;
  const value = argument.slice('--baseline='.length);
  if (!/^\d+$/.test(value)) throw new Error('--baseline needs a migration number, such as --baseline=007.');
  return Number(value);
}

function readTarget() {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) {
    throw new Error('Set MIGRATION_DATABASE_URL to the connection string of the database to migrate.');
  }
  const url = new URL(connectionString);
  if (url.hostname.includes('-pooler')) {
    throw new Error('Use the direct Neon connection string for migrations: the host must not contain "-pooler".');
  }
  return { connectionString, label: `${url.hostname}${url.pathname}` };
}

async function applyFile(client, directory, fileName) {
  console.log(`Applying ${fileName}`);
  // One simple-protocol query: a file with no BEGIN of its own still runs as one transaction.
  const sql = fs.readFileSync(path.join(directory, fileName), 'utf8').replace(/^﻿/, '');
  await client.query(sql);
  await client.query('INSERT INTO schema_migrations (file_name) VALUES ($1)', [fileName]);
}

async function migrate() {
  const baselineVersion = readBaselineVersion();
  const target = readTarget();
  const files = listSqlFiles(migrationsDir);
  const retiredFiles = listSqlFiles(retiredDir);

  if (baselineVersion !== null && !files.some((fileName) => migrationVersion(fileName) === baselineVersion)) {
    throw new Error(`No migration has the number ${baselineVersion}.`);
  }

  const client = new Client({ connectionString: target.connectionString });
  await client.connect();
  console.log(`Target database: ${target.label}`);

  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['schema_migrations']);

    const { rows: [state] } = await client.query(
      `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS has_ledger,
              EXISTS (
                SELECT 1 FROM pg_tables
                 WHERE schemaname = 'public' AND tablename <> 'schema_migrations'
              ) AS has_tables`,
    );

    if (state.has_ledger && baselineVersion !== null) {
      throw new Error('This database already has a migration ledger, so --baseline does not apply.');
    }
    if (!state.has_ledger && state.has_tables && baselineVersion === null) {
      throw new Error(
        'This database already has tables but no migration ledger. Nothing was changed. '
        + 'If it is a restored copy, run again with --baseline=<last migration it includes>.',
      );
    }

    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         file_name TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         baselined BOOLEAN NOT NULL DEFAULT FALSE
       )`,
    );

    if (baselineVersion !== null) {
      const included = files.filter((fileName) => migrationVersion(fileName) <= baselineVersion);
      for (const fileName of included) {
        await client.query('INSERT INTO schema_migrations (file_name, baselined) VALUES ($1, TRUE)', [fileName]);
      }
      console.log(`Recorded ${included.length} migrations as already included.`);
    }

    const { rows } = await client.query('SELECT file_name FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.file_name));

    // Every name in the ledger must be a file this runner knows, so an unknown history is never replayed.
    const known = new Set([...files, ...retiredFiles]);
    const unknown = [...applied].filter((fileName) => !known.has(fileName));
    if (unknown.length) {
      throw new Error(`This ledger has migrations this runner does not know: ${unknown.join(', ')}. Nothing was changed.`);
    }

    const retiredApplied = retiredFiles.filter((fileName) => applied.has(fileName));
    if (retiredApplied.length && retiredApplied.length !== retiredFiles.length) {
      throw new Error(
        'This database has only part of the pre-consolidation migration history. Apply the missing files from '
        + 'migrations_archive/pre-consolidation-2026-11-15 in order, then run this again. Nothing was changed.',
      );
    }
    if (retiredFiles.length && retiredApplied.length === retiredFiles.length) {
      // The complete old history already built the schema of files 001 to 007.
      const consolidated = files.filter((fileName) => migrationVersion(fileName) <= CONSOLIDATED_VERSION && !applied.has(fileName));
      if (consolidated.length) {
        await client.query(
          'INSERT INTO schema_migrations (file_name, baselined) SELECT unnest($1::TEXT[]), TRUE ON CONFLICT (file_name) DO NOTHING',
          [consolidated],
        );
        consolidated.forEach((fileName) => applied.add(fileName));
        console.log(`Recorded ${consolidated.length} consolidated migrations as already included for the complete old history.`);
      }
    }

    const pending = files.filter((fileName) => !applied.has(fileName));
    for (const fileName of pending) {
      await applyFile(client, migrationsDir, fileName);
    }

    console.log(pending.length ? `Applied ${pending.length} migrations.` : 'The database is already up to date.');
  } finally {
    await client.end();
  }
}

migrate().catch((error) => {
  console.error(`Migration stopped: ${error.message}`);
  process.exitCode = 1;
});
