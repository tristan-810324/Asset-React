-- The GSO check on a facility item that came back as Needs Repair: Repaired (back to stock) or Unserviceable (kept for history and Finance).
ALTER TABLE public.service_request_assets
  ADD COLUMN IF NOT EXISTS repair_outcome text CHECK (repair_outcome IS NULL OR repair_outcome IN ('Repaired', 'Unserviceable')),
  ADD COLUMN IF NOT EXISTS repair_outcome_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS repair_outcome_by_user_id bigint;
