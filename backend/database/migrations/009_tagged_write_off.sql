-- GSO repair check on a tagged unit that cannot be repaired: the reason, the waive-or-charge decision, and the
-- estimated value. Recorded on the return record, the same way facility write-offs are recorded (008).
BEGIN;

ALTER TABLE public.employee_issuance_returns
  ADD COLUMN IF NOT EXISTS write_off_reason text CHECK (write_off_reason IS NULL OR length(write_off_reason) <= 300),
  ADD COLUMN IF NOT EXISTS write_off_decision text CHECK (write_off_decision IS NULL OR write_off_decision IN ('WAIVED', 'CHARGED')),
  ADD COLUMN IF NOT EXISTS write_off_estimated_value numeric(12, 2) CHECK (write_off_estimated_value IS NULL OR write_off_estimated_value >= 0),
  ADD COLUMN IF NOT EXISTS write_off_by_user_id bigint REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS write_off_at timestamp with time zone;

COMMIT;
