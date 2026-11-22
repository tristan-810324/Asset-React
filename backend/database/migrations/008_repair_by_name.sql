-- Who repaired a tagged unit. Filled in when GSO marks the unit repaired and returns it to stock.
BEGIN;

ALTER TABLE public.asset_unit_tags
  ADD COLUMN IF NOT EXISTS repaired_by_name TEXT;

COMMIT;
