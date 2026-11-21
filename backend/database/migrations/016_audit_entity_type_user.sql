-- User account create, activate/deactivate, and delete write audit rows with entity_type 'user'.
-- The CHECK list did not include it, so those writes failed after the users row had already changed.
-- Only the entity_type CHECK list changes; no rows are rewritten.
BEGIN;

ALTER TABLE public.inventory_change_logs
  DROP CONSTRAINT IF EXISTS inventory_change_logs_entity_type_check,
  ADD CONSTRAINT inventory_change_logs_entity_type_check CHECK (
    entity_type = ANY (ARRAY['item'::text, 'category'::text, 'employee'::text, 'request'::text, 'signature'::text, 'facility_option'::text, 'user'::text])
  );

COMMIT;
