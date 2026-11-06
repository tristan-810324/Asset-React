-- A barcode lasts for one issuance: when the unit comes back to GSO its barcode is retired, and the
-- unit gets a fresh barcode that is printed when it is issued again.
BEGIN;

-- Why a barcode was retired: replaced by a reprint, or ended by a return.
ALTER TABLE asset_label_reprints
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'reprint';
ALTER TABLE asset_label_reprints
    DROP CONSTRAINT IF EXISTS asset_label_reprints_kind_check;
ALTER TABLE asset_label_reprints
    ADD CONSTRAINT asset_label_reprints_kind_check CHECK (kind IN ('reprint', 'return'));

-- Returns keep the barcode they were made with, so records still show it after it is retired.
UPDATE employee_issuance_returns AS return_record
   SET tag_snapshot = COALESCE(return_record.tag_snapshot, '{}'::JSONB) || jsonb_build_object('tagCode', tag.tag_code)
  FROM asset_unit_tags AS tag
 WHERE tag.id = return_record.asset_unit_tag_id
   AND (return_record.tag_snapshot IS NULL OR NOT return_record.tag_snapshot ? 'tagCode');

-- Units already back in GSO retire their barcode now, as if they had just been returned.
WITH in_storage AS (
    SELECT id, tag_code
      FROM asset_unit_tags
     WHERE custody_status <> 'Issued'
       AND lifecycle_status <> 'Disposed'
),
renamed AS (
    UPDATE asset_unit_tags AS tag
       SET tag_code = 'AST-' || upper(substr(md5(random()::TEXT || clock_timestamp()::TEXT || tag.id::TEXT), 1, 13)),
           label_version = tag.label_version + 1,
           label_printed_at = NULL,
           label_printed_by_user_id = NULL,
           updated_at = NOW()
      FROM in_storage
     WHERE tag.id = in_storage.id
    RETURNING tag.id, in_storage.tag_code AS old_tag_code, tag.tag_code AS new_tag_code, tag.label_version
)
INSERT INTO asset_label_reprints (asset_unit_tag_id, old_tag_code, new_tag_code, label_version, reason, kind)
SELECT id, old_tag_code, new_tag_code, label_version, 'Unit was already back in GSO when barcodes started retiring on return.', 'return'
  FROM renamed;

COMMIT;
