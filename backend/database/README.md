# Database layout

## Migrations

Migration files are kept in one numbered, chronological sequence under `migrations/`. Keep this order: later files may depend on tables or data created by earlier files.

Treat an applied migration as history. Add a new numbered file for schema changes; do not edit, rename, move, or delete an older migration unless the migration state of every target database has been verified and a replacement plan is prepared.

There is currently no checked-in migration runner or migration ledger. The configured database inspected on 2026-10-29 has no `public.schema_migrations` table. Do not run the full directory against an existing database blindly: first establish which migrations have already been applied and compare the live schema.

## Migration catalog

| Version | File | Scope |
| --- | --- | --- |
| 001 | `001_initial_schema.sql` | Roles, permissions, users, auth tokens, login events, and rate limits |
| 002 | `002_email_verification_otp.sql` | Allows email verification OTP tokens |
| 003 | `003_inventory_items.sql` | Inventory catalog and its indexes |
| 004 | `004_inventory_categories_and_change_history.sql` | Categories, category backfill, and inventory change history |
| 005 | `005_inventory_created_audit_action.sql` | Recreates the inventory audit action constraint |
| 006 | `006_employees_and_audit_logs.sql` | Departments, employees, issuance records, and employee audit references |
| 007 | `007_employee_issuance_returns.sql` | Return requests for employee issuances |
| 008 | `008_employee_issuance_batches.sql` | Batch issuances and batch references |
| 009 | `009_employee_issuance_quantities.sql` | Issuance quantities, unit backfill, and quantity constraint |
| 010 | `010_partial_issuance_returns.sql` | Partial return quantities and backfills |
| 011 | `011_employee_middle_name_suffix_picture.sql` | Employee profile fields |
| 012 | `012_inventory_item_name.sql` | Inventory item name and backfill |
| 013 | `013_request_center.sql` | Service requests, requested assets, and request history |
| 014 | `014_user_account_positions.sql` | User position and employee-to-user backfill |
| 015 | `015_it_staff_role_and_requester_label.sql` | IT staff role permissions and requester display label |
| 016 | `016_inventory_category_item_names.sql` | Category-specific inventory item names |
| 017 | `017_requester_identity_verification.sql` | Requester identity profiles and verification status |
| 018 | `018_requester_identity_employee_details.sql` | Name and picture fields for requester identity profiles |
| 019 | `019_asset_unit_tags.sql` | Unique barcode tag per physical inventory unit and GSO inspection fields |
| 020 | `020_issuance_requester_approval.sql` | Links each new issuance batch to the verified requester account that can decide it |
| 021 | `021_tagged_asset_returns.sql` | Links a confirmed physical-unit return to its unique barcode tag |
| 022 | `022_inventory_tracking_modes.sql` | Per-unit asset tags or quantity-tracked stock |
| 023 | `023_inventory_receipts.sql` | Receipt history for initial stock and later restocks |
| 024 | `024_inventory_storage_location.sql` | Storage location for stock records and per-unit tags |
| 025 | `025_inventory_serial_numbers.sql` | Stores manufacturer serial numbers before issuance |
| 026 | `026_inventory_issue_behavior.sql` | Distinguishes consumable quantity stock from returnable stock |
| 027 | `027_reusable_stock_borrow_details.sql` | Stores reusable-stock return dates, use location, and purpose |
| 028 | `028_reusable_borrowing_times.sql` | Adds the scheduled borrow and return times |

Migration 005 repeats a constraint shape that is already present in the checked-in 004 file. It may have been needed by databases that had an earlier version of 004, so it is retained until applied history can be verified.

## Seed data

`seeds/001_initial_seed.sql` is separate from schema migrations. It creates local demo accounts and resets their credentials when re-run. It also removes non-requester roles from the seeded requester account. Use it only for a disposable/local development database, not as a production cleanup script.

## Audit notes

The configured database was inspected read-only on 2026-10-29. No objects were deleted or changed during that inspection. Migrations 019, 020, and 021 were applied additively to the configured local database; no migration ledger records those applications. The backend also references schema that remains absent from the checked-in migrations and that database's `public` schema:

- Tables: `asset_movements` and `app_notifications`.
- `item_catalog` columns: `lifecycle_status` and `reorder_level`.
- `service_requests` columns: `external_forwarded_at`, `external_forwarded_to`, and `external_reference`.

The remaining objects need a schema reconciliation migration before a fresh database can support all current backend features. The definitions should be derived from the full application behavior and verified on a disposable database before being applied anywhere else.

Migration 021 adds a nullable foreign-key column and index for barcode-confirmed returns, so existing return rows remain valid. It was applied only after confirming migrations 019 and 020 were present in the configured local database. Verify the target schema before applying it in another environment.

No table is marked safe to drop based on the source alone. In particular, `permissions` and `role_permissions` have no current repository queries, but they are part of the seeded role model and may be intended for authorization. Keep them until their usage and data are confirmed across all environments.
