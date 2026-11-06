-- Each barcode can be printed once without a reason; printing it again means a reprint, which
-- issues a new barcode. These columns record that one print of the current barcode.
BEGIN;

ALTER TABLE asset_unit_tags
    ADD COLUMN IF NOT EXISTS label_printed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS label_printed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

-- A reprinted label was printed as part of its reprint. Original labels made before this
-- migration are left unprinted, so GSO can print each of them once.
UPDATE asset_unit_tags AS tag
   SET label_printed_at = latest.created_at,
       label_printed_by_user_id = latest.printed_by_user_id
  FROM (
    SELECT DISTINCT ON (asset_unit_tag_id) asset_unit_tag_id, created_at, printed_by_user_id
      FROM asset_label_reprints
     ORDER BY asset_unit_tag_id, created_at DESC, id DESC
  ) AS latest
 WHERE tag.id = latest.asset_unit_tag_id
   AND tag.label_printed_at IS NULL;

COMMIT;
