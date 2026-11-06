-- Lets one-time return codes also confirm quantity returns of bulk stock, which have no unit
-- barcode. A bulk code is bound to the issuance, quantity, and condition the employee was shown.
BEGIN;

ALTER TABLE asset_return_otps
    ALTER COLUMN asset_unit_tag_id DROP NOT NULL;

ALTER TABLE asset_return_otps
    ADD COLUMN IF NOT EXISTS quantity INTEGER,
    ADD COLUMN IF NOT EXISTS return_condition TEXT;

ALTER TABLE asset_return_otps
    DROP CONSTRAINT IF EXISTS asset_return_otps_target_check;

ALTER TABLE asset_return_otps
    ADD CONSTRAINT asset_return_otps_target_check CHECK (
        asset_unit_tag_id IS NOT NULL
        OR (quantity IS NOT NULL AND quantity > 0 AND return_condition IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS asset_return_otps_open_bulk_idx
    ON asset_return_otps (issuance_id)
    WHERE used_at IS NULL AND asset_unit_tag_id IS NULL;

COMMIT;
