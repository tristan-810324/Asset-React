-- Loss & Damage: GSO either waives a report (NO_CHARGE) or charges it (CHARGED) with an amount
-- calculated from the reported items' unit cost. Charged reports are paid at the Finance office, like
-- the facility return settlements. Adds one resolution and one amount column; no rows are rewritten.
BEGIN;

ALTER TABLE public.loss_damage_settlements
  ADD COLUMN IF NOT EXISTS charge_amount NUMERIC(12,2);

ALTER TABLE public.loss_damage_settlements
  DROP CONSTRAINT IF EXISTS loss_damage_settlements_resolution_check,
  DROP CONSTRAINT IF EXISTS loss_damage_settlements_status_check,
  DROP CONSTRAINT IF EXISTS loss_damage_settlements_charge_amount_check,
  ADD CONSTRAINT loss_damage_settlements_resolution_check CHECK (resolution = ANY (ARRAY['NO_CHARGE', 'FOR_REPAIR', 'CHARGED', 'RESOLVED'])),
  ADD CONSTRAINT loss_damage_settlements_status_check CHECK (
    (resolution = 'NO_CHARGE' AND status = 'NO_CHARGE')
    OR (resolution = 'FOR_REPAIR' AND status = 'FOR_REPAIR')
    OR (resolution = 'CHARGED' AND status = 'CHARGED')
    OR (resolution = 'RESOLVED' AND status = 'RESOLVED')
  ),
  ADD CONSTRAINT loss_damage_settlements_charge_amount_check CHECK (
    resolution <> 'CHARGED' OR (charge_amount IS NOT NULL AND charge_amount > 0 AND charge_amount <= 9999999999.99)
  );

COMMIT;
