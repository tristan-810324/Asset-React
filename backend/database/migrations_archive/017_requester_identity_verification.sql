BEGIN;

CREATE TABLE IF NOT EXISTS requester_identity_profiles (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    employee_code TEXT NOT NULL,
    department TEXT NOT NULL,
    position TEXT NOT NULL,
    contact_number TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'Pending',
    review_note TEXT NOT NULL DEFAULT '',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT requester_identity_employee_code_not_blank CHECK (length(trim(employee_code)) > 0),
    CONSTRAINT requester_identity_department_not_blank CHECK (length(trim(department)) > 0),
    CONSTRAINT requester_identity_position_not_blank CHECK (length(trim(position)) > 0),
    CONSTRAINT requester_identity_contact_not_blank CHECK (length(trim(contact_number)) > 0),
    CONSTRAINT requester_identity_status_check CHECK (
        verification_status IN ('Pending', 'Verified', 'Needs Correction')
    )
);

CREATE INDEX IF NOT EXISTS requester_identity_status_submitted_idx
    ON requester_identity_profiles (verification_status, submitted_at DESC);

COMMIT;
