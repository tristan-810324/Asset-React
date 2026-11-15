-- Audit Logs can now tell an issue from a return or an approval, record request decisions,
-- and mark the entries a reviewer should look at first (red flags).
BEGIN;

ALTER TABLE inventory_change_logs DROP CONSTRAINT IF EXISTS inventory_change_logs_entity_type_check;
ALTER TABLE inventory_change_logs ADD CONSTRAINT inventory_change_logs_entity_type_check
    CHECK (entity_type IN ('item', 'category', 'employee', 'request'));

ALTER TABLE inventory_change_logs DROP CONSTRAINT IF EXISTS inventory_change_logs_action_check;
ALTER TABLE inventory_change_logs ADD CONSTRAINT inventory_change_logs_action_check
    CHECK (action IN (
        'created', 'updated', 'renamed', 'deleted',
        'requested', 'issued', 'returned', 'received', 'approved', 'rejected', 'cancelled', 'moved'
    ));

-- MANUAL_ENTRY: a barcode was typed instead of scanned. ITEM_LOST: a unit was reported lost.
-- DELIVERY_UNDONE: a recorded purchase delivery was taken back. RECORD_DELETED: a record was removed.
-- LABEL_REPRINT: a unit barcode label was replaced.
ALTER TABLE inventory_change_logs ADD COLUMN IF NOT EXISTS flag TEXT;
ALTER TABLE inventory_change_logs DROP CONSTRAINT IF EXISTS inventory_change_logs_flag_check;
ALTER TABLE inventory_change_logs ADD CONSTRAINT inventory_change_logs_flag_check
    CHECK (flag IS NULL OR flag IN ('MANUAL_ENTRY', 'ITEM_LOST', 'DELIVERY_UNDONE', 'RECORD_DELETED', 'LABEL_REPRINT'));

ALTER TABLE inventory_change_logs ADD COLUMN IF NOT EXISTS request_id BIGINT REFERENCES service_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventory_change_logs_flag_changed_at_idx
    ON inventory_change_logs (changed_at DESC, id DESC) WHERE flag IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_change_logs_request_changed_at_idx
    ON inventory_change_logs (request_id, changed_at DESC);

-- Older issue and return entries were all saved as "updated"; give them their real action.
UPDATE inventory_change_logs
   SET action = CASE new_values->>'returnStatus'
                  WHEN 'Returned' THEN 'returned'
                  WHEN 'Lost' THEN 'returned'
                  WHEN 'Rejected' THEN 'rejected'
                  ELSE 'cancelled'
                END
 WHERE action = 'updated' AND entity_type = 'item'
   AND new_values->>'returnStatus' IN ('Returned', 'Lost', 'Rejected', 'Expired', 'Email Failed');

UPDATE inventory_change_logs
   SET action = CASE new_values->>'issuanceStatus'
                  WHEN 'Issued' THEN 'issued'
                  WHEN 'Rejected' THEN 'rejected'
                  ELSE 'cancelled'
                END
 WHERE action = 'updated' AND entity_type = 'item'
   AND NOT (new_values ? 'returnStatus')
   AND COALESCE(old_values->>'issuanceStatus', '') <> 'Issued'
   AND new_values->>'issuanceStatus' IN ('Issued', 'Rejected', 'Expired', 'Email Failed', 'Cancelled');

UPDATE inventory_change_logs SET flag = 'MANUAL_ENTRY'
 WHERE flag IS NULL AND new_values->>'entryMethod' = 'typed';
UPDATE inventory_change_logs SET flag = 'ITEM_LOST'
 WHERE flag IS NULL AND new_values->>'returnStatus' = 'Lost';
UPDATE inventory_change_logs SET flag = 'RECORD_DELETED'
 WHERE flag IS NULL AND action = 'deleted';
UPDATE inventory_change_logs SET flag = 'LABEL_REPRINT'
 WHERE flag IS NULL AND old_values ? 'tagCode' AND old_values ? 'labelVersion' AND new_values ? 'labelVersion';

COMMIT;
