-- GSO repair check on a facility item that is Unserviceable: the reason, the waive-or-charge decision, and the
-- estimated value (unit cost from the Item Master × units). Recorded on the returned asset row.
BEGIN;

ALTER TABLE public.service_request_assets
  ADD COLUMN IF NOT EXISTS write_off_reason text CHECK (write_off_reason IS NULL OR length(write_off_reason) <= 300),
  ADD COLUMN IF NOT EXISTS write_off_decision text CHECK (write_off_decision IS NULL OR write_off_decision IN ('WAIVED', 'CHARGED')),
  ADD COLUMN IF NOT EXISTS write_off_estimated_value numeric(12, 2) CHECK (write_off_estimated_value IS NULL OR write_off_estimated_value >= 0),
  ADD COLUMN IF NOT EXISTS write_off_by_user_id bigint REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS write_off_at timestamp with time zone;

COMMIT;
