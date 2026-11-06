BEGIN;

ALTER TABLE item_catalog
    ADD COLUMN IF NOT EXISTS tracking_mode TEXT NOT NULL DEFAULT 'individual';

ALTER TABLE item_catalog
    ADD CONSTRAINT item_catalog_tracking_mode_check
    CHECK (tracking_mode IN ('individual', 'quantity'));

CREATE INDEX IF NOT EXISTS item_catalog_tracking_mode_idx
    ON item_catalog (tracking_mode, created_at DESC);

COMMIT;
