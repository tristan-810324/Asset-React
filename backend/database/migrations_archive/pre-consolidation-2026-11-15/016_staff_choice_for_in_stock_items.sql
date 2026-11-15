-- GSO Staff choose to issue an in-stock item or ask the GSO Head first, unless the Head locked the item.
BEGIN;

-- STAFF_ISSUE now means "GSO Staff decides"; its quantity limit is optional (NULL means no limit).
ALTER TABLE item_category_item_names DROP CONSTRAINT item_category_item_names_staff_policy_limit_check;
ALTER TABLE item_category_item_names ALTER COLUMN approval_policy SET DEFAULT 'STAFF_ISSUE';

-- Rules no GSO Head has saved switch to the new default; rules a Head saved stay as they are.
WITH reset AS (
  UPDATE item_category_item_names
     SET approval_policy = 'STAFF_ISSUE', staff_issue_max_quantity = NULL, policy_updated_at = NOW()
   WHERE approval_policy = 'GSO_HEAD' AND policy_updated_by_user_id IS NULL
  RETURNING id
)
INSERT INTO item_category_item_name_policy_history (
  item_name_id, previous_policy, new_policy, previous_staff_limit, new_staff_limit, reason, changed_by_user_id
)
SELECT id, 'GSO_HEAD', 'STAFF_ISSUE', NULL, NULL,
       'Default changed: GSO Staff now choose to issue in-stock items or ask the GSO Head first.', NULL
  FROM reset;

COMMIT;
