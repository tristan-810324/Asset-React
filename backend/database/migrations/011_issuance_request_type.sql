-- Lets a requester ask GSO to issue an item that is not in the borrowing catalog.
BEGIN;

ALTER TABLE service_requests DROP CONSTRAINT service_requests_type_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_type_check CHECK (
    request_type IN ('BORROWING', 'FACILITY_USE', 'JOB_REQUEST', 'PURCHASE_REQUISITION', 'LOSS_DAMAGE_REPORT', 'ISSUANCE_REQUEST')
);

COMMIT;
