BEGIN;

ALTER TABLE auth_tokens
    DROP CONSTRAINT IF EXISTS auth_tokens_purpose_check;

ALTER TABLE auth_tokens
    ADD CONSTRAINT auth_tokens_purpose_check
    CHECK (purpose IN ('reset_otp', 'password_reset', 'email_verification_otp'));

COMMIT;
