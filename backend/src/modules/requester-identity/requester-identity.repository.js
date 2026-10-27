const pool = require('../../config/db');

const IDENTITY_SELECT = `
  SELECT requester.id AS "userId",
         requester.name AS "accountName",
         requester.email AS "accountEmail",
         COALESCE(profile.employee_code, '') AS "employeeCode",
         COALESCE(profile.department, '') AS department,
         COALESCE(profile.position, '') AS position,
         COALESCE(profile.contact_number, '') AS "contactNumber",
         COALESCE(profile.verification_status, 'Incomplete') AS status,
         COALESCE(profile.review_note, '') AS "reviewNote",
         profile.submitted_at AS "submittedAt",
         profile.reviewed_at AS "reviewedAt",
         employee.employee_code AS "matchedEmployeeCode",
         employee.department AS "matchedDepartment",
         employee.position AS "matchedPosition",
         employee.email AS "matchedEmail",
         employee.status AS "matchedEmployeeStatus",
         CASE
           WHEN employee.id IS NULL THEN FALSE
           WHEN lower(trim(employee.email)) = lower(trim(requester.email))
            AND lower(trim(employee.department)) = lower(trim(profile.department))
            AND lower(trim(employee.position)) = lower(trim(profile.position))
            AND employee.status = 'Active' THEN TRUE
           ELSE FALSE
         END AS "employeeRecordMatch"
    FROM users AS requester
    LEFT JOIN requester_identity_profiles AS profile ON profile.user_id = requester.id
    LEFT JOIN employees AS employee
      ON lower(trim(employee.employee_code)) = lower(trim(profile.employee_code))
   `;

async function getMine(userId) {
  const result = await pool.query(`${IDENTITY_SELECT} WHERE requester.id = $1`, [userId]);
  return result.rows[0] || null;
}

async function isVerified(userId) {
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM requester_identity_profiles
        WHERE user_id = $1 AND verification_status = 'Verified'
     ) AS verified`,
    [userId],
  );
  return Boolean(result.rows[0]?.verified);
}

async function submitMine(userId, identity) {
  await pool.query(
    `INSERT INTO requester_identity_profiles (
       user_id, employee_code, department, position, contact_number, verification_status,
       review_note, submitted_at, reviewed_at, reviewed_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, 'Pending', '', NOW(), NULL, NULL)
     ON CONFLICT (user_id) DO UPDATE SET
       employee_code = EXCLUDED.employee_code,
       department = EXCLUDED.department,
       position = EXCLUDED.position,
       contact_number = EXCLUDED.contact_number,
       verification_status = 'Pending',
       review_note = '',
       submitted_at = NOW(),
       reviewed_at = NULL,
       reviewed_by_user_id = NULL,
       updated_at = NOW()`,
    [userId, identity.employeeCode, identity.department, identity.position, identity.contactNumber],
  );
  return getMine(userId);
}

async function listReviews(status) {
  const values = status && status !== 'all' ? [status] : [];
  const statusFilter = values.length ? 'AND profile.verification_status = $1' : '';
  const result = await pool.query(
    `${IDENTITY_SELECT}
      WHERE profile.user_id IS NOT NULL
      ${statusFilter}
      ORDER BY CASE profile.verification_status WHEN 'Pending' THEN 0 WHEN 'Needs Correction' THEN 1 ELSE 2 END,
               profile.submitted_at DESC, requester.name`,
    values,
  );
  return result.rows;
}

async function review(userId, { status, note, reviewedByUserId }) {
  const result = await pool.query(
    `UPDATE requester_identity_profiles
        SET verification_status = $2,
            review_note = $3,
            reviewed_at = NOW(),
            reviewed_by_user_id = $4,
            updated_at = NOW()
      WHERE user_id = $1
      RETURNING user_id`,
    [userId, status, note, reviewedByUserId],
  );
  return result.rows[0] ? listReviewByUserId(userId) : null;
}

async function listReviewByUserId(userId) {
  const result = await pool.query(`${IDENTITY_SELECT} WHERE requester.id = $1 AND profile.user_id IS NOT NULL`, [userId]);
  return result.rows[0] || null;
}

module.exports = { getMine, isVerified, submitMine, listReviews, listReviewByUserId, review };
