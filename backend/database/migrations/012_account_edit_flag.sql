-- Admin edits to a user account's name or position are flagged in the audit log (amber, ACCOUNT_EDITED).
BEGIN;

ALTER TABLE public.inventory_change_logs
  DROP CONSTRAINT IF EXISTS inventory_change_logs_flag_check;

ALTER TABLE public.inventory_change_logs
  ADD CONSTRAINT inventory_change_logs_flag_check CHECK (
    flag IS NULL OR flag = ANY (ARRAY[
      'MANUAL_ENTRY', 'ITEM_LOST', 'DELIVERY_UNDONE', 'RECORD_DELETED', 'LABEL_REPRINT', 'FINANCE_PDF_REPRINT',
      'ACCOUNT_EDITED'
    ]::TEXT[])
  );

COMMIT;
