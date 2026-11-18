-- Who repairs a facility item that came back as Needs Repair: GSO staff or ITSS.
-- Only set for a damaged row whose damage is Needs Repair; NULL otherwise.
ALTER TABLE public.service_request_assets
  ADD COLUMN IF NOT EXISTS repair_owner text CHECK (repair_owner IS NULL OR repair_owner IN ('GSO', 'ITSS'));
