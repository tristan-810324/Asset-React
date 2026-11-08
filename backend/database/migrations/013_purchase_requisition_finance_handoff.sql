-- GSO Head review and external Finance handoff for purchase requisitions.
BEGIN;

ALTER TABLE service_requests
    DROP CONSTRAINT service_requests_status_check;

ALTER TABLE service_requests
    ADD CONSTRAINT service_requests_status_check CHECK (
        status IN (
            'Submitted', 'Under Review', 'Needs Information', 'Approved', 'Rejected',
            'Ready for Pickup', 'Issued', 'Return Requested', 'Returned', 'For Repair',
            'In Progress', 'Completed', 'Closed', 'Cancelled',
            'GSO Endorsed', 'Finance Handoff Pending', 'Finance Handoff Failed',
            'Sent to Finance', 'Finance Response Recorded'
        )
    );

ALTER TABLE service_requests
    ADD COLUMN gso_head_endorsed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN gso_head_endorsed_at TIMESTAMPTZ,
    ADD COLUMN finance_email TEXT,
    ADD COLUMN finance_sent_at TIMESTAMPTZ,
    ADD COLUMN finance_message_id TEXT,
    ADD COLUMN finance_decision TEXT,
    ADD COLUMN finance_reference TEXT,
    ADD COLUMN finance_response_note TEXT,
    ADD COLUMN finance_response_at TIMESTAMPTZ,
    ADD COLUMN finance_response_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE service_requests
    ADD CONSTRAINT service_requests_finance_decision_check CHECK (
        finance_decision IS NULL OR finance_decision IN ('Approved', 'Needs Changes', 'Rejected')
    ),
    ADD CONSTRAINT service_requests_finance_response_note_length CHECK (
        finance_response_note IS NULL OR length(finance_response_note) <= 2000
    );

CREATE INDEX service_requests_purchase_finance_status_idx
    ON service_requests (status, created_at DESC, id DESC)
    WHERE request_type = 'PURCHASE_REQUISITION';

COMMIT;
