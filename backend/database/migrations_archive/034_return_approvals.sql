-- GSO asks, IT Admin decides: writing off a damaged return, or settling a lost one as paid or
-- replaced, takes a second person, so no single staff member can make stock disappear.
BEGIN;

ALTER TABLE employee_issuance_returns
    ADD COLUMN IF NOT EXISTS approval_action TEXT,
    ADD COLUMN IF NOT EXISTS approval_note TEXT,
    ADD COLUMN IF NOT EXISTS approval_requested_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approval_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approval_decision_note TEXT;

ALTER TABLE employee_issuance_returns
    DROP CONSTRAINT IF EXISTS employee_issuance_returns_approval_check;
ALTER TABLE employee_issuance_returns
    ADD CONSTRAINT employee_issuance_returns_approval_check CHECK (
        (approval_action IS NULL OR approval_action IN ('Written Off', 'Paid', 'Replaced'))
        AND (approval_note IS NULL OR length(approval_note) <= 1000)
        AND (approval_decision_note IS NULL OR length(approval_decision_note) <= 1000)
    );

CREATE INDEX IF NOT EXISTS employee_issuance_returns_approval_idx
    ON employee_issuance_returns (approval_requested_at)
    WHERE approval_action IS NOT NULL;

COMMIT;
