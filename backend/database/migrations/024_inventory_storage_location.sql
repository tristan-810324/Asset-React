BEGIN;

ALTER TABLE item_catalog
    ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT 'GSO Storage';

UPDATE item_catalog
   SET location = 'GSO Storage'
 WHERE location IS NULL OR btrim(location) = '';

ALTER TABLE item_catalog
    ALTER COLUMN location SET DEFAULT 'GSO Storage',
    ALTER COLUMN location SET NOT NULL;

COMMIT;
