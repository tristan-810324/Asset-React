-- Loss & Damage: a damaged item goes straight to To Be Repaired when GSO decides, and the decision records
-- who repairs it (GSO or ITSS). Same owner values as the returns repair owner (010).
BEGIN;

ALTER TABLE public.loss_damage_settlements
  ADD COLUMN IF NOT EXISTS repair_owner text;


ALTER TABLE public.loss_damage_settlements
  DROP CONSTRAINT IF EXISTS loss_damage_settlements_repair_owner_check,
  ADD CONSTRAINT loss_damage_settlements_repair_owner_check CHECK (repair_owner IS NULL OR repair_owner IN ('GSO', 'ITSS'));

COMMIT;
