# Pre-consolidation migrations (kept, not run)

These 29 files were the migration history up to 2026-11-15. They are kept here unchanged, so nothing is lost. The
seven files in `../../migrations/` build the same schema. A check on 2026-11-15 confirmed the consolidated files
create exactly the same 262 schema statements (tables, columns, constraints, indexes, sequences), with the same
reference data.

Nothing in this folder is run by `npm run db:migrate`. The runner only reads `../../migrations/`.

## Where each file went

| Old file | Now in |
| --- | --- |
| 001_auth_and_roles | 001 (users, roles and permissions, sign-in tokens, login history, rate limits, role seeds) |
| 002_departments_and_employees | 002 (departments and seed, employees) |
| 003_inventory | 003 (categories and seed, item names and seed, Item Master stock, receipts, counts) |
| 004_audit_log | 004 (inventory change log) |
| 005_issuances | 005 (issuance batches and issuances) |
| 006_asset_tags_and_labels | 005 (unit barcode tags, label reprints) |
| 007_returns | 005 (returns, return codes) |
| 008_request_center | 004 (service requests, their assets and history, reference sequence) |
| 009_requester_identity | 002 (requester verification profiles) |
| 010_database_time_settings | 001 (database time settings) |
| 011_issuance_request_type | 004 (ISSUANCE_REQUEST request type) |
| 012_gso_head_role | 001 (GSO Head role and permission) |
| 013_purchase_requisition_finance_handoff | 004 (requisition status and Finance columns) |
| 014_purchase_requisition_routing | 006 (requisition lines, stock reservations, receipts, policy history) |
| 015_staff_first_requisition_routing | 006 (staff review routing) |
| 016_staff_choice_for_in_stock_items | 003 and 006 (approval policy defaults, policy history) |
| 017_app_notifications | 007 (in-app notifications) |
| 018_purchase_delivery_without_finance_reply | 004 and 006 (final status and route lists) |
| 019_issuance_recipient_details | 005 (recipient location and purpose) |
| 020_employee_position_master_data | 002 (employee positions table) |
| 021_audit_events_and_flags | 004 (audit actions and flags) |
| 022_gso_head_signatures | 007 (GSO Head signatures) |
| 023_finance_pdf_reprint_flag | 004 (audit flag) |
| 024_signature_audit_entries | 004 (audit entity type) |
| 025_facility_options | 007 (Facility Use venues and seed) |
| 026_facility_release_and_returns | 004 (facility slip, return and settlement columns) |
| 027_facility_return_damage_count | 004 (damaged units count) |
| 028_service_work_orders | 004 (Job / Service work orders and tasks) |
| 029_service_work_orders_others_category | 004 (Others category) |

## One-time data steps that were not carried over

Each step below changed rows that existed when the file ran. A new database has no such rows, so the step does
nothing there. Every existing database that ran these files already has the result, so nothing is lost. The
schema changes in the same files are all kept.

| Old file | Lines | What it did to existing rows | Why it is not in the new files |
| --- | --- | --- | --- |
| 014 | 69-99 | Copied each requisition item from the request's form data into `purchase_requisition_lines`. | No requests exist in a new database. |
| 014 | 101-113 | Reopened old approved requisitions for re-review, with a history note. | Same. |
| 015 | 18-40 | Moved requisitions waiting for the GSO Head to staff review, with history notes. | Same. |
| 016 | 8-20 | Reset the default approval policy of rules no GSO Head had saved, and logged each change. | No item rules exist in a new database. The new default is already in `003`. |
| 018 | 8-29 | Converted requisitions answered by Finance into the new statuses, with history notes. | No requisitions exist in a new database. |
| 018 | 31-43 | Moved approved requisitions to Sent to Finance, with history notes. | Same. |
| 018 | 45-47 | Changed route statuses FINANCE_SENT and FINANCE_RESPONSE to WAITING_FOR_PURCHASE. | Same. |
| 020 | 17-34 | Copied established positions from employees, requester profiles, and users into `employee_positions`. | No employees exist in a new database. Positions are added in the app. |
| 021 | 31-51 | Gave older issue and return audit entries their real action (returned, issued, and so on). | No audit entries exist in a new database. |
| 021 | 53-60 | Filled audit flags (MANUAL_ENTRY, ITEM_LOST, RECORD_DELETED, LABEL_REPRINT) on existing entries. | Same. |
| 028 | 94-136 | Created work orders for existing Job requests, with route, category, priority, and dates. | No Job requests exist in a new database. |
| 028 | 139-150 | Created checklist rows for existing Job requests. | Same. |

## Not carried over: nothing else

- `010` is kept: its database time settings are in `001`.
- Reference data is kept: roles and permissions (`001`, GSO Head in `001`), departments (`002`), item categories
  and item names (`003`), and facility venues (`007`).
- No table, column, constraint, or index was removed. The 262 schema statements match.

## Restoring the old history

If you ever need the old files again, copy them back into `../../migrations/` in a separate test database. Do not
mix them with the seven consolidated files in one database.
