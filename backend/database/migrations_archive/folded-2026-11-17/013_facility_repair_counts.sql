-- A GSO check can split one damaged row: some units Repaired, the rest Unserviceable. Counts replace the single outcome
-- from 012, which was never applied to a real database.
ALTER TABLE public.service_request_assets
  ADD COLUMN IF NOT EXISTS repaired_quantity integer NOT NULL DEFAULT 0 CHECK (repaired_quantity >= 0),
  ADD COLUMN IF NOT EXISTS unserviceable_quantity integer NOT NULL DEFAULT 0 CHECK (unserviceable_quantity >= 0);

ALTER TABLE public.service_request_assets
  DROP CONSTRAINT IF EXISTS service_request_assets_repair_checked_check,
  ADD CONSTRAINT service_request_assets_repair_checked_check
    CHECK (repaired_quantity + unserviceable_quantity <= damaged_quantity);

-- Carry over the single outcome from 012, then drop it.
UPDATE public.service_request_assets SET repaired_quantity = damaged_quantity WHERE repair_outcome = 'Repaired';
UPDATE public.service_request_assets SET unserviceable_quantity = damaged_quantity WHERE repair_outcome = 'Unserviceable';

ALTER TABLE public.service_request_assets
  DROP COLUMN IF EXISTS repair_outcome,
  DROP COLUMN IF EXISTS repair_outcome_at,
  DROP COLUMN IF EXISTS repair_outcome_by_user_id;
