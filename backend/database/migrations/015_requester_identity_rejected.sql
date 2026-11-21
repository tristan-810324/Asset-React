-- GSO can now reject a requester account outright (status Rejected), separate from Needs Correction.
-- Only the status CHECK list changes; no rows are rewritten.
BEGIN;

ALTER TABLE public.requester_identity_profiles
  DROP CONSTRAINT IF EXISTS requester_identity_status_check,
  ADD CONSTRAINT requester_identity_status_check CHECK (
    verification_status = ANY (ARRAY['Pending'::text, 'Verified'::text, 'Needs Correction'::text, 'Rejected'::text])
  );

COMMIT;
 
    