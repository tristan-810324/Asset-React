BEGIN;

ALTER TABLE employee_issuance_batches
    ADD COLUMN IF NOT EXISTS requester_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS employee_issuance_batches_requester_status_idx
    ON employee_issuance_batches (requester_user_id, status, requested_at DESC)
    WHERE requester_user_id IS NOT NULL;

COMMIT;
