# Database layout

The schema is in seven consolidated files in [migrations/](./migrations/). Run them with one command, for a new
database or an existing one:

```powershell
$env:MIGRATION_DATABASE_URL = "postgresql://..."
npm run db:migrate
```

`MIGRATION_DATABASE_URL` must be a direct PostgreSQL or Neon connection string. The runner never reads
`backend/.env`, and it rejects Neon pooler hosts. It records each file name in `schema_migrations`.

| File | Scope |
| --- | --- |
| `001_accounts_and_roles.sql` | Users, roles and permissions, sign-in tokens and history, rate limits, time settings, and role seeds |
| `002_people_and_requester_profiles.sql` | Departments and seed, positions, employees, and requester verification profiles |
| `003_inventory_and_item_master.sql` | Item categories and item names with seeds, Item Master stock, receipts, and blind stock counts |
| `004_requests_and_audit.sql` | Request Center (service requests, assets, history), Job / Service work orders, and the audit log |
| `005_issuances_assets_and_returns.sql` | Issuing and borrowing, barcode tags per unit, label reprints, returns, and return codes |
| `006_purchase_requisition_workflow.sql` | Requisition routing, stock reservations, deliveries, and the approval policy history |
| `007_platform_support.sql` | Notifications, GSO Head signatures, and Facility Use venues with seed |
| `008_loss_damage_cases.sql` | Loss / Damage decisions and signed PayMongo webhook records |
| `009_facility_damage_payments.sql` | PayMongo settlement links for unserviceable Facility Use returns |

## Which case you are in

- **New, empty database:** `npm run db:migrate` applies all migrations.
- **Existing database that ran the old 29 files (for example Neon):** `npm run db:migrate` records 001 to 007 as
  already included and applies nothing else. If the database has only part of the old history, the runner stops
  and changes nothing. Apply the missing old files from `migrations_archive/pre-consolidation-2026-11-15` in order,
  then run it again.
- **A restored copy with tables but no `schema_migrations` ledger:** the runner stops and changes nothing. If the
  copy already has the whole schema, run:

  ```powershell
  npm run db:migrate -- --baseline=007
  ```

## Adding a change

The next forward migration is `008_<feature>.sql`. Add it to `migrations/` and keep the matching table definitions
in the consolidated files up to date in the same change, so a fresh install and an upgraded database stay the same.
Do not rename, edit, or delete a file that has already been applied.

## Archive

[migrations_archive/pre-consolidation-2026-11-15](./migrations_archive/pre-consolidation-2026-11-15/) keeps the 29
files that were used before consolidation, unchanged. Its README lists where each one went, and each one-time data
step that was not carried over, with the reason.

## Seed data

[seeds/001_initial_seed.sql](./seeds/001_initial_seed.sql) is for disposable local development only. It creates demo
accounts and can reset their credentials when rerun. Do not use it as a production cleanup command.
