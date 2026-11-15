-- Finance no longer replies in the app. The GSO Head's email is the go-ahead; GSO Staff buy the items,
-- put them in Item Master Data, and link each delivery to the requests waiting for it.
BEGIN;

ALTER TABLE purchase_requisition_lines DROP CONSTRAINT purchase_requisition_lines_status_check;
ALTER TABLE service_requests DROP CONSTRAINT service_requests_status_check;

-- A request Finance answered with anything but Approved goes back to the GSO Head, who settles it with
-- Finance and sends it again.
WITH reopened AS (
  UPDATE service_requests
     SET status = 'GSO Endorsed', updated_at = NOW()
   WHERE request_type = 'PURCHASE_REQUISITION'
     AND status = 'Finance Response Recorded'
     AND finance_decision IS DISTINCT FROM 'Approved'
  RETURNING id, finance_decision
), lines AS (
  UPDATE purchase_requisition_lines AS line
     SET route_status = 'WAITING_FINANCE', updated_at = NOW()
    FROM reopened
   WHERE line.request_id = reopened.id AND line.route_status = 'FINANCE_RESPONSE'
  RETURNING line.id
)
INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
SELECT id, 'Finance Response Recorded', 'GSO Endorsed',
       'Finance replies are no longer recorded in A.S.SET. Finance had answered "' || COALESCE(finance_decision, 'no decision')
         || '", so the GSO Head settles this with Finance and sends the requisition again.',
       NULL
  FROM reopened;

-- A request Finance approved keeps its progress: GSO Staff can buy the items and link the deliveries.
WITH approved AS (
  UPDATE service_requests
     SET status = 'Sent to Finance', updated_at = NOW()
   WHERE request_type = 'PURCHASE_REQUISITION'
     AND status = 'Finance Response Recorded'
  RETURNING id
)
INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
SELECT id, 'Finance Response Recorded', 'Sent to Finance',
       'Finance replies are no longer recorded in A.S.SET. Finance had approved this purchase, so GSO Staff can buy the items and link the deliveries.',
       NULL
  FROM approved;

UPDATE purchase_requisition_lines
   SET route_status = 'WAITING_FOR_PURCHASE', updated_at = NOW()
 WHERE route_status IN ('FINANCE_SENT', 'FINANCE_RESPONSE');

ALTER TABLE purchase_requisition_lines ADD CONSTRAINT purchase_requisition_lines_status_check CHECK (route_status IN (
  'WAITING_STAFF_REVIEW', 'WAITING_GSO_HEAD', 'NEEDS_INFORMATION', 'READY_FOR_STAFF', 'PARTIAL_STOCK',
  'WAITING_FINANCE', 'WAITING_FOR_PURCHASE', 'REJECTED',
  'PARTIALLY_ISSUED', 'HANDOVER_PENDING', 'ISSUED', 'CANCELLED'
));

ALTER TABLE service_requests ADD CONSTRAINT service_requests_status_check CHECK (
  status IN (
    'Submitted', 'Under Review', 'Needs Information', 'Approved', 'Rejected',
    'Ready for Pickup', 'Issued', 'Return Requested', 'Returned', 'For Repair',
    'In Progress', 'Completed', 'Closed', 'Cancelled',
    'GSO Endorsed', 'Finance Handoff Pending', 'Finance Handoff Failed', 'Sent to Finance'
  )
);

-- GSO Staff can undo a delivery link until the units are issued. The record stays for the audit trail.
ALTER TABLE purchase_requisition_line_receipts
  ADD COLUMN voided_at TIMESTAMPTZ,
  ADD COLUMN voided_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

COMMIT;
