BEGIN;

ALTER TABLE item_catalog
    ADD COLUMN IF NOT EXISTS serial_number TEXT;

UPDATE item_catalog AS item
   SET serial_number = (
       SELECT asset_tag.serial_number
         FROM asset_unit_tags AS asset_tag
        WHERE asset_tag.item_id = item.id
          AND asset_tag.serial_number IS NOT NULL
          AND btrim(asset_tag.serial_number) <> ''
        ORDER BY asset_tag.unit_number
        LIMIT 1
   )
 WHERE item.serial_number IS NULL
   AND EXISTS (
       SELECT 1
         FROM asset_unit_tags AS asset_tag
        WHERE asset_tag.item_id = item.id
          AND asset_tag.serial_number IS NOT NULL
          AND btrim(asset_tag.serial_number) <> ''
   );

CREATE UNIQUE INDEX IF NOT EXISTS item_catalog_serial_number_lower_unique_idx
    ON item_catalog (lower(btrim(serial_number)))
    WHERE serial_number IS NOT NULL AND btrim(serial_number) <> '';

COMMIT;
