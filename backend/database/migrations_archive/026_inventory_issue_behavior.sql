BEGIN;

ALTER TABLE item_catalog
    ADD COLUMN IF NOT EXISTS issue_behavior TEXT NOT NULL DEFAULT 'returnable';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'item_catalog_issue_behavior_check'
           AND conrelid = 'item_catalog'::regclass
    ) THEN
        ALTER TABLE item_catalog
            ADD CONSTRAINT item_catalog_issue_behavior_check
            CHECK (issue_behavior IN ('consumable', 'returnable'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS item_catalog_issue_behavior_idx
    ON item_catalog (tracking_mode, issue_behavior, created_at DESC);

COMMIT;
