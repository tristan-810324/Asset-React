BEGIN;

ALTER TABLE item_catalog
    ADD COLUMN IF NOT EXISTS item_name TEXT;

UPDATE item_catalog
   SET item_name = description
 WHERE item_name IS NULL OR length(trim(item_name)) = 0;

ALTER TABLE item_catalog
    ALTER COLUMN item_name SET NOT NULL;

ALTER TABLE item_catalog
    DROP CONSTRAINT IF EXISTS item_catalog_item_name_not_blank;

ALTER TABLE item_catalog
    ADD CONSTRAINT item_catalog_item_name_not_blank
    CHECK (length(trim(item_name)) > 0);

COMMIT;
