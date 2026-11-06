BEGIN;

-- The application records item/category creation in inventory_change_logs.
-- Extend the existing action constraint without rewriting earlier migrations.
ALTER TABLE inventory_change_logs
    DROP CONSTRAINT IF EXISTS inventory_change_logs_action_check;

ALTER TABLE inventory_change_logs
    ADD CONSTRAINT inventory_change_logs_action_check
    CHECK (action IN ('created', 'updated', 'renamed', 'deleted'));

COMMIT;
