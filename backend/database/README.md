# Database layout

## Migrations

`migrations/` builds the whole schema from an empty database in ten files, one per feature. Keep their order: later files reference tables created by earlier files.

| Version | File | Scope |
| --- | --- | --- |
| 001 | `001_auth_and_roles.sql` | Roles, permissions, users, auth tokens, login events, rate limits, and the base roles |
| 002 | `002_departments_and_employees.sql` | Departments with their defaults, and the employee master list |
| 003 | `003_inventory.sql` | Categories, suggested item names, stock records, receipts, and blind stock counts |
| 004 | `004_audit_log.sql` | The audit log of item, category, employee, issuance, and return changes |
| 005 | `005_issuances.sql` | Issuance batches and the items in them, with reusable-stock borrowing details |
| 006 | `006_asset_tags_and_labels.sql` | One barcode tag per physical unit, and the history of retired barcodes |
| 007 | `007_returns.sql` | Returns, repair holds, lost-item settlements, IT Admin approvals, and return codes |
| 008 | `008_request_center.sql` | Service requests, requested assets, and request history |
| 009 | `009_requester_identity.sql` | Requester identity profiles and their verification status |
| 010 | `010_database_time_settings.sql` | Database time zone and date style that match the local server |

Treat an applied migration as history. Add a new numbered file, starting at `011`, for every later schema change. Do not edit, rename, move, or delete a file that a database has already applied.

Run migrations with `npm run db:migrate`, which applies the pending files in order and records each one in `schema_migrations`. The script takes its target only from `MIGRATION_DATABASE_URL`, never from `backend/.env`, and refuses Neon pooled connection strings.

## Archived migrations

`migrations_archive/` keeps the 37 files that built the schema until 2026-11-07, unchanged. They are history, not part of a new setup. On an empty database, files 001 to 010 build exactly the schema and reference data that archived files 001 to 037 built: every column, type, default, constraint, index, sequence, and seed row, with the same names. This was checked by applying both sets to empty PostgreSQL 18 databases and comparing the results.

The consolidated files leave out what only mattered while upgrading older databases: backfills of earlier rows, constraints dropped and added again, archived file 005 (a repeat of 004), archived file 015 (replaced by 029), and the issuance index that 006 created and 009 dropped. The code reads constraint and index names in its error handling, so every name is unchanged.

A database that already has tables needs no changes:

- **Ledger with archived file names** (migrated with `npm run db:migrate` before the consolidation): the script applies the archived files it is missing, then records 001 to 010 as already included.
- **No ledger** (migrations applied by hand, such as the local database): its schema must include all 37 archived files. Then run `npm run db:migrate -- --baseline=010` once to record the current files as already included. The local database matched archived files 001 to 037 on 2026-11-07.

The script refuses a database that has tables but no `schema_migrations` table, because replaying migrations could damage it.

## Seed data

`seeds/001_initial_seed.sql` is separate from schema migrations. It creates local demo accounts and resets their credentials when re-run. It also removes non-requester roles from the seeded requester account. Use it only for a disposable/local development database, not as a production cleanup script.

## Audit notes

The backend references schema that no migration creates:

- Tables: `asset_movements` and `app_notifications`.
- `item_catalog` columns: `lifecycle_status` and `reorder_level`.
- `service_requests` columns: `external_forwarded_at`, `external_forwarded_to`, and `external_reference`.

As of 2026-11-05, only the `dashboard`, `notifications`, `reports`, and `movements` modules need these objects, and `src/app.js` mounts none of those routes. The inventory module checks for `asset_movements` before using it. A fresh database therefore supports every mounted route. Those modules would need a new migration before being mounted, with definitions derived from the full application behavior and verified on a disposable database.

Some schema has no current writer but is kept on purpose:

- `permissions` and `role_permissions` have no repository queries, but they are part of the seeded role model and may be intended for authorization.
- `employee_issuance_returns.voided_at`, `voided_by_user_id`, and `void_reason`, the `Voided` return status, `asset_return_otps.override_reason`, and the `admin_override` confirmation method belong to the removed IT Admin void and override features. The code still reads them to show older records and to exclude override codes, so dropping them would break those queries.

Keep these until their usage and data are confirmed across all environments.
