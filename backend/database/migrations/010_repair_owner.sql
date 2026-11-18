-- Who checks a returned unit that needs repair: GSO or ITSS. An ITSS unit notifies IT Admin, and its
-- outcome notifies GSO. Recorded on the return record, the same way the write-off fields are (009).
BEGIN;

ALTER TABLE public.employee_issuance_returns
  ADD COLUMN IF NOT EXISTS repair_owner text;

ALTER TABLE public.employee_issuance_returns
  DROP CONSTRAINT IF EXISTS employee_issuance_returns_repair_owner_check,
  ADD CONSTRAINT employee_issuance_returns_repair_owner_check CHECK (repair_owner IS NULL OR repair_owner IN ('GSO', 'ITSS'));

COMMIT;
