    BEGIN;

    ALTER TABLE employee_issuance_returns
        ADD COLUMN IF NOT EXISTS asset_unit_tag_id BIGINT
        REFERENCES asset_unit_tags(id) ON DELETE RESTRICT;

    CREATE INDEX IF NOT EXISTS employee_issuance_returns_asset_unit_tag_idx
        ON employee_issuance_returns (asset_unit_tag_id, decided_at DESC)
        WHERE asset_unit_tag_id IS NOT NULL;

    COMMIT;
