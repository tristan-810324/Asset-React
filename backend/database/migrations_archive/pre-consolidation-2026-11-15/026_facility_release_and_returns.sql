-- Facilities and equipment requests after approval.
-- Approval reserves the items as service_request_assets rows. GSO prints a slip, releases the items (status
-- Issued), records how many came back, and settles any missing quantity. Missing units leave the stock at once
-- and wait for settlement, the same rule as a lost employee issuance.
BEGIN;

ALTER TABLE service_requests
    ADD COLUMN IF NOT EXISTS slip_printed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS slip_printed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS overdue_reminded_at TIMESTAMPTZ;

ALTER TABLE service_request_assets
    ADD COLUMN IF NOT EXISTS returned_quantity INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS lost_quantity INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS returned_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS settlement_status TEXT,
    ADD COLUMN IF NOT EXISTS settlement_note TEXT,
    ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS settled_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE service_request_assets DROP CONSTRAINT IF EXISTS service_request_assets_return_counts_check;
ALTER TABLE service_request_assets ADD CONSTRAINT service_request_assets_return_counts_check CHECK (
    returned_quantity >= 0 AND lost_quantity >= 0 AND returned_quantity + lost_quantity <= quantity
);

ALTER TABLE service_request_assets DROP CONSTRAINT IF EXISTS service_request_assets_settlement_check;
ALTER TABLE service_request_assets ADD CONSTRAINT service_request_assets_settlement_check CHECK (
    settlement_status IS NULL OR settlement_status IN ('Pending', 'Replaced', 'Paid', 'Waived')
);

-- Finds a requester's unsettled missing items quickly (they block new equipment requests).
CREATE INDEX IF NOT EXISTS service_request_assets_pending_settlement_idx
    ON service_request_assets (request_id) WHERE settlement_status = 'Pending';

COMMIT;
