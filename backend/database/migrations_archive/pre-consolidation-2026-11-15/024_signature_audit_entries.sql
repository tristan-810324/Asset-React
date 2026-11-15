-- Each upload or replacement of a GSO Head's e-signature is recorded in the audit logs.
BEGIN;

ALTER TABLE inventory_change_logs DROP CONSTRAINT IF EXISTS inventory_change_logs_entity_type_check;
ALTER TABLE inventory_change_logs ADD CONSTRAINT inventory_change_logs_entity_type_check
    CHECK (entity_type IN ('item', 'category', 'employee', 'request', 'signature'));

COMMIT;
