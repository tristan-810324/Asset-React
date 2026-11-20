-- Loss & Damage: a damaged case is closed once its item is sent to Repair & Maintenance, because the repair is
-- tracked there. Cases decided before this rule stayed In Progress; close them when the item has already left
-- the requester's holdings (custody_resolved_at is set). Only the status changes; no item or payment is touched.
BEGIN;

WITH closed AS (
  UPDATE service_requests AS request
     SET status = 'Closed', updated_at = NOW()
    FROM loss_damage_settlements AS settlement
   WHERE settlement.request_id = request.id
     AND request.request_type = 'LOSS_DAMAGE_REPORT'
     AND request.status = 'In Progress'
     AND settlement.status = 'FOR_REPAIR'
     AND settlement.custody_resolved_at IS NOT NULL
  RETURNING request.id
)
INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
SELECT id, 'In Progress', 'Closed', 'Closed: the damaged item was sent to Repair & Maintenance.', NULL
  FROM closed;

COMMIT;
