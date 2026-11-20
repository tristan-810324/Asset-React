-- Item numbers per transaction: each issuance (batch) numbers its units ITEM 1..N, and the number is stored
-- when the unit is given out, so printed labels and the requester's list keep the same number.
-- unit_number is left as it was (it still orders units). Existing batches are numbered once, by barcode order.
BEGIN;

ALTER TABLE public.asset_unit_tags
  ADD COLUMN IF NOT EXISTS batch_item_number INTEGER;

ALTER TABLE public.employee_issuance_batches
  ADD COLUMN IF NOT EXISTS numbered_items INTEGER NOT NULL DEFAULT 0;

-- A unit belongs to the batch of the issuance it was given to, even after it came back (the return record keeps that link).
WITH batch_tags AS (
  SELECT DISTINCT tag.id AS tag_id, issue.batch_id
    FROM asset_unit_tags AS tag
    JOIN employee_issuances AS issue ON issue.id = tag.issuance_id
  UNION
  SELECT DISTINCT return_record.asset_unit_tag_id AS tag_id, issue.batch_id
    FROM employee_issuance_returns AS return_record
    JOIN employee_issuances AS issue ON issue.id = return_record.issuance_id
   WHERE return_record.asset_unit_tag_id IS NOT NULL
),
numbered AS (
  SELECT tag_id, batch_id, ROW_NUMBER() OVER (PARTITION BY batch_id ORDER BY tag_id) AS item_number
    FROM batch_tags
)
UPDATE asset_unit_tags AS tag
   SET batch_item_number = numbered.item_number
  FROM numbered
 WHERE tag.id = numbered.tag_id
   AND tag.batch_item_number IS NULL;

WITH batch_tags AS (
  SELECT DISTINCT tag.id AS tag_id, issue.batch_id
    FROM asset_unit_tags AS tag
    JOIN employee_issuances AS issue ON issue.id = tag.issuance_id
  UNION
  SELECT DISTINCT return_record.asset_unit_tag_id AS tag_id, issue.batch_id
    FROM employee_issuance_returns AS return_record
    JOIN employee_issuances AS issue ON issue.id = return_record.issuance_id
   WHERE return_record.asset_unit_tag_id IS NOT NULL
),
totals AS (
  SELECT batch_id, COUNT(*) AS total FROM batch_tags GROUP BY batch_id
)
UPDATE employee_issuance_batches AS batch
   SET numbered_items = totals.total
  FROM totals
 WHERE batch.id = totals.batch_id
   AND batch.numbered_items < totals.total;

COMMIT;
