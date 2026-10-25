const pool = require('../../config/db');

async function listForUser(user) {
  const result = await pool.query(
    `SELECT id, notification_type AS "type", title, message, href,
            created_at AS "createdAt", read_at AS "readAt", resolved_at AS "resolvedAt"
       FROM app_notifications
      WHERE resolved_at IS NULL
        AND (recipient_user_id = $1 OR recipient_role_key = ANY($2::TEXT[]))
      ORDER BY read_at NULLS FIRST, created_at DESC, id DESC
      LIMIT 100`,
    [user.id, user.roles],
  );
  return result.rows;
}

async function markRead(id, user) {
  const result = await pool.query(
    `UPDATE app_notifications AS notification
        SET read_at = COALESCE(read_at, NOW())
      WHERE notification.id = $1 AND notification.resolved_at IS NULL
        AND (notification.recipient_user_id = $2 OR notification.recipient_role_key = ANY($3::TEXT[]))
      RETURNING notification.id`,
    [id, user.id, user.roles],
  );
  if (!result.rowCount) throw Object.assign(new Error('Hindi makita ang notification.'), { status: 404 });
}

async function markAllRead(user) {
  await pool.query(
    `UPDATE app_notifications SET read_at = NOW()
      WHERE resolved_at IS NULL AND read_at IS NULL
        AND (recipient_user_id = $1 OR recipient_role_key = ANY($2::TEXT[]))`,
    [user.id, user.roles],
  );
}

async function refreshOperationalNotifications() {
  await pool.query(`
    WITH active AS (
      SELECT issue.item_id, SUM(issue.quantity - issue.returned_quantity)::INTEGER AS qty
        FROM employee_issuances AS issue WHERE issue.status IN ('Pending', 'Issued') GROUP BY issue.item_id
      UNION ALL
      SELECT asset.item_id, SUM(asset.quantity)::INTEGER AS qty
        FROM service_request_assets AS asset
        JOIN service_requests AS request ON request.id = asset.request_id
       WHERE request.status IN ('Approved', 'Ready for Pickup', 'Issued', 'Return Requested', 'For Repair') GROUP BY asset.item_id
    ), used AS (SELECT item_id, SUM(qty)::INTEGER AS qty FROM active GROUP BY item_id), low AS (
      SELECT item.id, item.item_code, COALESCE(NULLIF(item.item_name, ''), item.description) AS item_name,
             GREATEST(item.quantity - COALESCE(used.qty, 0) - COALESCE((SELECT COUNT(*) FROM asset_unit_tags AS tag
               WHERE tag.item_id = item.id AND tag.lifecycle_status = 'Pending Disposal' AND tag.custody_status = 'Available'), 0), 0)::INTEGER AS available, item.reorder_level
        FROM item_catalog AS item LEFT JOIN used ON used.item_id = item.id
       WHERE item.lifecycle_status = 'Active' AND item.reorder_level > 0
    )
    INSERT INTO app_notifications (recipient_role_key, notification_type, title, message, href, dedupe_key)
    SELECT 'GSO_STAFF', 'LOW_STOCK', 'Low stock: ' || item_name,
           item_code || ' has ' || available || ' available; reorder threshold is ' || reorder_level || '.',
           '/gso/items', 'low-stock:' || id
      FROM low WHERE available <= reorder_level
    ON CONFLICT (dedupe_key) DO UPDATE SET
      title = EXCLUDED.title, message = EXCLUDED.message, resolved_at = NULL,
      read_at = CASE WHEN app_notifications.resolved_at IS NOT NULL THEN NULL ELSE app_notifications.read_at END`);

  await pool.query(`
    UPDATE app_notifications AS notification SET resolved_at = NOW()
     WHERE notification.notification_type = 'LOW_STOCK' AND notification.resolved_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM item_catalog AS item
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(issue.quantity - issue.returned_quantity), 0)
                   + COALESCE((SELECT SUM(asset.quantity)
                                FROM service_request_assets AS asset
                                JOIN service_requests AS request ON request.id = asset.request_id
                               WHERE asset.item_id = item.id AND request.status IN ('Approved', 'Ready for Pickup', 'Issued', 'Return Requested', 'For Repair')), 0)
                   + COALESCE((SELECT COUNT(*) FROM asset_unit_tags AS tag
                                WHERE tag.item_id = item.id AND tag.lifecycle_status = 'Pending Disposal' AND tag.custody_status = 'Available'), 0) AS used
              FROM employee_issuances AS issue WHERE issue.item_id = item.id AND issue.status IN ('Pending', 'Issued')
          ) AS usage ON TRUE
          WHERE notification.dedupe_key = 'low-stock:' || item.id
            AND item.lifecycle_status = 'Active' AND item.reorder_level > 0
            AND GREATEST(item.quantity - usage.used, 0) <= item.reorder_level
       )`);

  await pool.query(`
    INSERT INTO app_notifications (recipient_user_id, notification_type, title, message, href, dedupe_key)
    SELECT request.requested_by_user_id, 'OVERDUE', 'Borrowed item is overdue',
           'Request ' || request.reference_no || ' has an item past its due date (' || to_char(MIN(asset.due_date), 'Mon DD, YYYY') || ').',
           '/borrower/requests/' || request.id, 'overdue:' || request.id
      FROM service_requests AS request
      JOIN service_request_assets AS asset ON asset.request_id = request.id
     WHERE request.request_type = 'BORROWING' AND request.status IN ('Issued', 'Return Requested')
       AND asset.due_date < CURRENT_DATE
     GROUP BY request.id, request.reference_no, request.requested_by_user_id
    ON CONFLICT (dedupe_key) DO UPDATE SET
      message = EXCLUDED.message, resolved_at = NULL,
      read_at = CASE WHEN app_notifications.resolved_at IS NOT NULL THEN NULL ELSE app_notifications.read_at END`);

  await pool.query(`
    UPDATE app_notifications AS notification SET resolved_at = NOW()
     WHERE notification.notification_type = 'OVERDUE' AND notification.resolved_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM service_requests AS request
         JOIN service_request_assets AS asset ON asset.request_id = request.id
          WHERE notification.dedupe_key = 'overdue:' || request.id
            AND request.request_type = 'BORROWING' AND request.status IN ('Issued', 'Return Requested')
            AND asset.due_date < CURRENT_DATE
       )`);
}

module.exports = { listForUser, markRead, markAllRead, refreshOperationalNotifications };
