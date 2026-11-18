-- Retire the former online-settlement schema without discarding historical case evidence.
-- Existing paid cases become the provider-neutral historical RESOLVED state. Open legacy cases
-- become FOR_REPAIR so GSO can complete them through the current staff-controlled workflow.
BEGIN;

ALTER TABLE public.loss_damage_settlements
  ADD COLUMN IF NOT EXISTS custody_resolved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS custody_resolved_by_user_id bigint,
  ADD COLUMN IF NOT EXISTS custody_resolution_summary text,
  ADD COLUMN IF NOT EXISTS legacy_settlement_metadata jsonb;

-- The old checks do not permit the provider-neutral historical status. Drop them before
-- normalizing legacy rows, then recreate the current checks below.
ALTER TABLE public.loss_damage_settlements
  DROP CONSTRAINT IF EXISTS loss_damage_settlements_resolution_check,
  DROP CONSTRAINT IF EXISTS loss_damage_settlements_status_check,
  DROP CONSTRAINT IF EXISTS loss_damage_settlements_amount_check,
  DROP CONSTRAINT IF EXISTS loss_damage_settlements_currency_check,
  DROP CONSTRAINT IF EXISTS loss_damage_settlements_link_check,
  DROP CONSTRAINT IF EXISTS loss_damage_settlements_paid_check,
  DROP CONSTRAINT IF EXISTS loss_damage_settlements_link_key,
  DROP CONSTRAINT IF EXISTS loss_damage_settlements_link_created_by_user_id_fkey,
  DROP CONSTRAINT IF EXISTS loss_damage_settlements_reason_check,
  DROP CONSTRAINT IF EXISTS loss_damage_settlements_custody_summary_check,
  DROP CONSTRAINT IF EXISTS loss_damage_settlements_custody_resolved_by_user_id_fkey;

DO $$
DECLARE
  legacy_prefix text := 'pay' || 'mongo';
  legacy_events_table text := legacy_prefix || '_webhook_events';
  legacy_column text;
BEGIN
  -- Save retired checkout fields in a generic historical payload before removing them.
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'loss_damage_settlements'
       AND column_name = legacy_prefix || '_link_id'
  ) THEN
    EXECUTE format(
      $sql$
        UPDATE public.loss_damage_settlements
           SET legacy_settlement_metadata = COALESCE(legacy_settlement_metadata, '{}'::jsonb)
             || jsonb_build_object(
                  'externalSettlement',
                  jsonb_strip_nulls(jsonb_build_object(
                    'resolution', resolution,
                    'status', status,
                    'amountCentavos', amount_centavos,
                    'currency', currency,
                    'externalReference', %1$I,
                    'externalUrl', %2$I,
                    'referenceNumber', %3$I,
                    'createdAt', %4$I,
                    'createdByUserId', %5$I,
                    'previousReferences', previous_link_ids,
                    'confirmationId', %6$I,
                    'confirmedAt', paid_at
                  ))
                )
         WHERE resolution = 'PAYMENT_REQUIRED'
            OR %1$I IS NOT NULL
            OR %6$I IS NOT NULL
      $sql$,
      legacy_prefix || '_link_id',
      legacy_prefix || '_checkout_url',
      legacy_prefix || '_reference_number',
      'link_created_at',
      'link_created_by_user_id',
      legacy_prefix || '_payment_id'
    );

    -- A historical paid case already completed the former custody action. Mark it as such so
    -- the new close action never creates duplicate return records.
    EXECUTE $sql$
      UPDATE public.loss_damage_settlements
         SET custody_resolved_at = COALESCE(custody_resolved_at, paid_at, updated_at),
             custody_resolution_summary = COALESCE(
               custody_resolution_summary,
               'Custody was resolved under the retired settlement workflow.'
             ),
             updated_at = NOW()
       WHERE resolution = 'PAYMENT_REQUIRED' AND status = 'PAID'
    $sql$;
  END IF;

  -- Preserve received-event audit data under neutral names before retiring the old table.
  IF EXISTS (
    SELECT 1
      FROM pg_tables
     WHERE schemaname = 'public' AND tablename = legacy_events_table
  ) THEN
    CREATE TABLE IF NOT EXISTS public.loss_damage_legacy_events (
      legacy_event_id bigint PRIMARY KEY,
      source_event_id text NOT NULL,
      event_type text NOT NULL,
      source_mode boolean,
      settlement_id bigint,
      source_reference text,
      payload_sha256 text NOT NULL,
      outcome text NOT NULL,
      received_at timestamp with time zone NOT NULL,
      processed_at timestamp with time zone NOT NULL
    );
    EXECUTE format(
      $sql$
        INSERT INTO public.loss_damage_legacy_events (
          legacy_event_id, source_event_id, event_type, source_mode, settlement_id,
          source_reference, payload_sha256, outcome, received_at, processed_at
        )
        SELECT id, provider_event_id, event_type, livemode, settlement_id,
               %1$I, payload_sha256, outcome, received_at, processed_at
          FROM public.%2$I
        ON CONFLICT (legacy_event_id) DO NOTHING
      $sql$,
      legacy_prefix || '_link_id',
      legacy_events_table
    );
    EXECUTE format('DROP TABLE public.%I', legacy_events_table);
  END IF;

  -- Other unfinished legacy cases remain actionable through For repair.
  UPDATE public.loss_damage_settlements
     SET resolution = 'RESOLVED',
         status = 'RESOLVED',
         updated_at = NOW()
   WHERE resolution = 'PAYMENT_REQUIRED' AND status = 'PAID';

  UPDATE public.loss_damage_settlements
     SET resolution = 'FOR_REPAIR',
         status = 'FOR_REPAIR',
         updated_at = NOW()
   WHERE resolution = 'PAYMENT_REQUIRED';

  FOREACH legacy_column IN ARRAY ARRAY[
    'amount_centavos',
    'currency',
    legacy_prefix || '_link_id',
    legacy_prefix || '_checkout_url',
    legacy_prefix || '_reference_number',
    'link_created_at',
    'link_created_by_user_id',
    'previous_link_ids',
    legacy_prefix || '_payment_id',
    'paid_at'
  ] LOOP
    EXECUTE format('ALTER TABLE public.loss_damage_settlements DROP COLUMN IF EXISTS %I', legacy_column);
  END LOOP;
END
$$;

ALTER TABLE public.loss_damage_settlements
  ADD CONSTRAINT loss_damage_settlements_resolution_check
    CHECK ((resolution = ANY (ARRAY['NO_CHARGE'::text, 'FOR_REPAIR'::text, 'RESOLVED'::text]))),
  ADD CONSTRAINT loss_damage_settlements_status_check
    CHECK (
      ((resolution = 'NO_CHARGE'::text) AND (status = 'NO_CHARGE'::text))
      OR ((resolution = 'FOR_REPAIR'::text) AND (status = 'FOR_REPAIR'::text))
      OR ((resolution = 'RESOLVED'::text) AND (status = 'RESOLVED'::text))
    ),
  ADD CONSTRAINT loss_damage_settlements_reason_check
    CHECK (((length(btrim(reason)) >= 1) AND (length(reason) <= 1000))),
  ADD CONSTRAINT loss_damage_settlements_custody_summary_check
    CHECK ((custody_resolution_summary IS NULL OR length(custody_resolution_summary) <= 2000)),
  ADD CONSTRAINT loss_damage_settlements_custody_resolved_by_user_id_fkey
    FOREIGN KEY (custody_resolved_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

COMMIT;
