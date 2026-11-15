-- Facility returns: how many of the returned units are damaged.
-- One request row can hold many units (for example 100 monoblocks). GSO counts what came back, what is missing,
-- and what is damaged, so "97 good, 3 need repair" is recorded instead of one condition for the whole row.
-- condition_in keeps the damage type when damaged_quantity is above 0, and Good otherwise.
BEGIN;

ALTER TABLE service_request_assets
    ADD COLUMN IF NOT EXISTS damaged_quantity INTEGER NOT NULL DEFAULT 0;

ALTER TABLE service_request_assets DROP CONSTRAINT IF EXISTS service_request_assets_damaged_check;
ALTER TABLE service_request_assets ADD CONSTRAINT service_request_assets_damaged_check CHECK (
    damaged_quantity >= 0 AND damaged_quantity <= returned_quantity
);

COMMIT;
