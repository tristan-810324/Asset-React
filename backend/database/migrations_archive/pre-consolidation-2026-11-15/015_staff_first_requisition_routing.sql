-- GSO Staff checks every requisition item first; the GSO Head only sees items that need approval.
BEGIN;

ALTER TABLE purchase_requisition_lines DROP CONSTRAINT purchase_requisition_lines_status_check;
ALTER TABLE purchase_requisition_lines ADD CONSTRAINT purchase_requisition_lines_status_check CHECK (route_status IN (
  'WAITING_STAFF_REVIEW', 'WAITING_GSO_HEAD', 'NEEDS_INFORMATION', 'READY_FOR_STAFF', 'PARTIAL_STOCK',
  'WAITING_FINANCE', 'FINANCE_SENT', 'FINANCE_RESPONSE', 'REJECTED',
  'PARTIALLY_ISSUED', 'HANDOVER_PENDING', 'ISSUED', 'CANCELLED'
));
ALTER TABLE purchase_requisition_lines ALTER COLUMN route_status SET DEFAULT 'WAITING_STAFF_REVIEW';

ALTER TABLE service_requests
  ADD COLUMN staff_reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN staff_reviewed_at TIMESTAMPTZ,
  ADD COLUMN staff_review_note TEXT NOT NULL DEFAULT '',
  ADD CONSTRAINT service_requests_staff_review_note_length CHECK (length(staff_review_note) <= 2000);

-- Items the GSO Head has not decided yet have no stock check, so GSO Staff check them first.
WITH reopened AS (
  UPDATE purchase_requisition_lines AS line
     SET route_status = 'WAITING_STAFF_REVIEW', updated_at = NOW()
    FROM service_requests AS request
   WHERE request.id = line.request_id
     AND request.status IN ('Submitted', 'Under Review')
     AND line.route_status = 'WAITING_GSO_HEAD'
     AND line.reserved_quantity = 0
     AND line.finance_quantity = 0
  RETURNING line.request_id
), moved AS (
  UPDATE service_requests
     SET status = 'Submitted', updated_at = NOW()
   WHERE id IN (SELECT request_id FROM reopened)
     AND status = 'Under Review'
  RETURNING id
)
INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
SELECT id, 'Under Review', 'Submitted',
       'Moved to GSO Staff review: staff now check stock before an item goes to the GSO Head.',
       NULL
  FROM moved;

COMMIT;
