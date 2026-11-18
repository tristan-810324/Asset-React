-- Facility returns can have a separate damage settlement from missing-item settlement.
-- facility_asset_ids identifies the returned asset rows covered by this request-level settlement.
BEGIN;

ALTER TABLE public.loss_damage_settlements
  ADD COLUMN facility_asset_ids bigint[];

CREATE INDEX loss_damage_settlements_facility_assets_idx
  ON public.loss_damage_settlements USING GIN (facility_asset_ids)
  WHERE facility_asset_ids IS NOT NULL;

COMMIT;


