-- FINANCE_PDF_REPRINT: a signed purchase requisition PDF already handed to Finance was printed again.
BEGIN;

ALTER TABLE inventory_change_logs DROP CONSTRAINT IF EXISTS inventory_change_logs_flag_check;
ALTER TABLE inventory_change_logs ADD CONSTRAINT inventory_change_logs_flag_check
    CHECK (flag IS NULL OR flag IN (
        'MANUAL_ENTRY', 'ITEM_LOST', 'DELIVERY_UNDONE', 'RECORD_DELETED', 'LABEL_REPRINT', 'FINANCE_PDF_REPRINT'
    ));

COMMIT;
