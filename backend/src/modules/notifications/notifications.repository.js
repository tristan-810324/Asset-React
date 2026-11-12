const pool = require('../../config/db');

async function createUserNotification({ userId, type, title, message, href, dedupeKey }) {
  await pool.query(
    `INSERT INTO app_notifications (recipient_user_id, notification_type, title, message, href, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (dedupe_key) DO UPDATE SET
       title = EXCLUDED.title, message = EXCLUDED.message, href = EXCLUDED.href, resolved_at = NULL,
       read_at = CASE WHEN app_notifications.resolved_at IS NOT NULL THEN NULL ELSE app_notifications.read_at END`,
    [userId, type, title, message, href, dedupeKey],
  );
}

async function createRoleNotification({ roleKey, type, title, message, href, dedupeKey }) {
  await pool.query(
    `INSERT INTO app_notifications (recipient_user_id, notification_type, title, message, href, dedupe_key)
     SELECT account.id, $2, $3, $4, $5, $6 || ':' || account.id::TEXT
       FROM users AS account
       JOIN user_roles AS assigned ON assigned.user_id = account.id
       JOIN roles ON roles.id = assigned.role_id
      WHERE roles.role_key = $1 AND account.is_active = TRUE
     ON CONFLICT (dedupe_key) DO UPDATE SET
       title = EXCLUDED.title, message = EXCLUDED.message, href = EXCLUDED.href, resolved_at = NULL,
       read_at = CASE WHEN app_notifications.resolved_at IS NOT NULL THEN NULL ELSE app_notifications.read_at END`,
    [roleKey, type, title, message, href, dedupeKey],
  );
}

async function listForUser(user) {
  const result = await pool.query(
    `SELECT id, notification_type AS "type", title, message, href, dedupe_key AS "dedupeKey",
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
  // shortcut: low-stock alerts were removed because item_catalog has no reorder_level column yet;
  // add that column and an Item Master Data field first, then bring the alert back.
  await pool.query(`UPDATE app_notifications SET resolved_at = NOW() WHERE notification_type = 'LOW_STOCK' AND resolved_at IS NULL`);

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

// Hides every open notification whose key starts with the prefix, for example the GSO Head's
// "needs your decision" once the decision is made. Keys are built by our code, never by users.
async function resolveByPrefix(prefix) {
  await pool.query(
    `UPDATE app_notifications SET resolved_at = NOW()
      WHERE resolved_at IS NULL AND left(dedupe_key, length($1)) = $1`,
    [prefix],
  );
}

// The verified requester account that holds this employee code, if one exists.
async function userIdForEmployeeCode(employeeCode) {
  const result = await pool.query(
    `SELECT user_id FROM requester_identity_profiles
      WHERE verification_status = 'Verified' AND lower(trim(employee_code)) = lower(trim($1))
      ORDER BY reviewed_at DESC NULLS LAST, user_id LIMIT 1`,
    [employeeCode],
  );
  return result.rows[0]?.user_id ?? null;
}

// The verified department head (position "head") of the employee's department.
async function headUserIdForEmployeeCode(employeeCode) {
  const result = await pool.query(
    `SELECT profile.user_id
       FROM employees AS staff
       JOIN employees AS head
         ON lower(trim(head.department)) = lower(trim(staff.department)) AND head.status = 'Active'
       JOIN requester_identity_profiles AS profile
         ON lower(trim(profile.employee_code)) = lower(trim(head.employee_code))
            AND profile.verification_status = 'Verified'
      WHERE lower(trim(staff.employee_code)) = lower(trim($1))
        AND lower(trim(profile.position)) = 'head'
      ORDER BY profile.reviewed_at DESC NULLS LAST, profile.user_id
      LIMIT 1`,
    [employeeCode],
  );
  return result.rows[0]?.user_id ?? null;
}

module.exports = {
  listForUser, markRead, markAllRead, refreshOperationalNotifications,
  createUserNotification, createRoleNotification, resolveByPrefix, userIdForEmployeeCode, headUserIdForEmployeeCode,
};
