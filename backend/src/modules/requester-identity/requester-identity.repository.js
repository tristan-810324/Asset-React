const pool = require('../../config/db');

const IDENTITY_SELECT = `
  SELECT requester.id AS "userId",
         requester.name AS "accountName",
         requester.email AS "accountEmail",
         COALESCE(profile.employee_code, '') AS "employeeCode",
         COALESCE(profile.first_name, '') AS "firstName",
         COALESCE(profile.middle_name, '') AS "middleName",
         COALESCE(profile.last_name, '') AS "lastName",
         COALESCE(profile.suffix, '') AS suffix,
         COALESCE(profile.department, '') AS department,
         COALESCE(profile.position, '') AS position,
         COALESCE(profile.contact_number, '') AS "contactNumber",
         profile.picture_data AS "pictureData",
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
            AND lower(trim(employee.first_name)) = lower(trim(profile.first_name))
            AND lower(trim(COALESCE(employee.middle_name, ''))) = lower(trim(COALESCE(profile.middle_name, '')))
            AND lower(trim(employee.last_name)) = lower(trim(profile.last_name))
            AND lower(trim(COALESCE(employee.suffix, ''))) = lower(trim(COALESCE(profile.suffix, '')))
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
       user_id, employee_code, first_name, middle_name, last_name, suffix,
       department, position, contact_number, picture_data, verification_status,
       review_note, submitted_at, reviewed_at, reviewed_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Pending', '', NOW(), NULL, NULL)
     ON CONFLICT (user_id) DO UPDATE SET
       employee_code = EXCLUDED.employee_code,
       first_name = EXCLUDED.first_name,
       middle_name = EXCLUDED.middle_name,
       last_name = EXCLUDED.last_name,
       suffix = EXCLUDED.suffix,
       department = EXCLUDED.department,
       position = EXCLUDED.position,
       contact_number = EXCLUDED.contact_number,
       picture_data = EXCLUDED.picture_data,
       verification_status = 'Pending',
       review_note = '',
       submitted_at = NOW(),
       reviewed_at = NULL,
       reviewed_by_user_id = NULL,
       updated_at = NOW()`,
    [
      userId,
      identity.employeeCode,
      identity.firstName,
      identity.middleName,
      identity.lastName,
      identity.suffix,
      identity.department,
      identity.position,
      identity.contactNumber,
      identity.pictureData,
    ],
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const identityResult = await client.query(
      `SELECT profile.user_id, profile.employee_code, profile.first_name,
              profile.middle_name, profile.last_name, profile.suffix,
              profile.picture_data, profile.department, profile.position,
              profile.verification_status,
              requester.name AS account_name, requester.email AS account_email
         FROM requester_identity_profiles AS profile
         JOIN users AS requester ON requester.id = profile.user_id
        WHERE profile.user_id = $1
        FOR UPDATE OF profile, requester`,
      [userId],
    );
    const identity = identityResult.rows[0];
    if (!identity) {
      await client.query('COMMIT');
      return null;
    }

    if (status === 'Verified') {
      const accountNameParts = String(identity.account_name).trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
      const suffixPattern = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
      const legacySuffix = accountNameParts.length > 2 && suffixPattern.test(accountNameParts[accountNameParts.length - 1])
        ? accountNameParts.pop().replace(/\.$/, '')
        : '';
      const legacyFirstName = accountNameParts.shift() || '';
      const legacyLastName = accountNameParts.pop() || '';
      const hasSubmittedName = Boolean(identity.first_name && identity.last_name);
      const employeeName = {
        firstName: identity.first_name || legacyFirstName,
        middleName: identity.middle_name || (hasSubmittedName ? '' : accountNameParts.join(' ')),
        lastName: identity.last_name || legacyLastName,
        suffix: identity.suffix || (hasSubmittedName ? '' : legacySuffix),
      };
      if (!employeeName.firstName || !employeeName.lastName) {
        throw Object.assign(
          new Error('Kailangang may first name at surname ang requester bago ito maidagdag sa Employee Master Data.'),
          { status: 400 },
        );
      }

      const employeeResult = await client.query(
        `SELECT id, employee_code, first_name, middle_name, last_name, suffix,
                department, position, email, status
           FROM employees
          WHERE lower(trim(employee_code)) = lower(trim($1))
          FOR UPDATE`,
        [identity.employee_code],
      );
      const existingEmployee = employeeResult.rows[0];

      if (existingEmployee) {
        const employeeRecordMatch = existingEmployee.status === 'Active'
          && existingEmployee.email.trim().toLowerCase() === identity.account_email.trim().toLowerCase()
          && existingEmployee.first_name.trim().toLowerCase() === employeeName.firstName.trim().toLowerCase()
          && (existingEmployee.middle_name || '').trim().toLowerCase() === employeeName.middleName.trim().toLowerCase()
          && existingEmployee.last_name.trim().toLowerCase() === employeeName.lastName.trim().toLowerCase()
          && (existingEmployee.suffix || '').trim().toLowerCase() === employeeName.suffix.trim().toLowerCase()
          && existingEmployee.department.trim().toLowerCase() === identity.department.trim().toLowerCase()
          && existingEmployee.position.trim().toLowerCase() === identity.position.trim().toLowerCase();
        if (!employeeRecordMatch && !note.trim()) {
          throw Object.assign(
            new Error('Maglagay ng review note kung mano-manong ive-verify ang profile na hindi eksaktong tumugma sa Employee Master Data.'),
            { status: 400 },
          );
        }
      }

      // Keep an existing Employee Master Data record as the source of truth.
      // Add new requester profiles only after GSO approval.
      if (!employeeResult.rows[0]) {
        const emailResult = await client.query(
          `SELECT employee_code
             FROM employees
            WHERE lower(trim(email)) = lower(trim($1))
            LIMIT 1`,
          [identity.account_email],
        );
        if (emailResult.rows[0]) {
          throw Object.assign(
            new Error(`Ang email na ito ay naka-link na sa employee code ${emailResult.rows[0].employee_code}. Suriin ang employee number bago mag-approve.`),
            { status: 409 },
          );
        }

        const createdResult = await client.query(
          `INSERT INTO employees (
             employee_code, first_name, middle_name, last_name, suffix,
             department, position, email, status, picture_data, created_by_user_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Active', $9, $10)
           RETURNING id, employee_code, first_name, middle_name, last_name, suffix,
                     department, position, email, status`,
          [
            identity.employee_code,
            employeeName.firstName,
            employeeName.middleName,
            employeeName.lastName,
            employeeName.suffix,
            identity.department,
            identity.position,
            identity.account_email,
            identity.picture_data,
            reviewedByUserId,
          ],
        );
        const employee = createdResult.rows[0];
        await client.query(
          `INSERT INTO inventory_change_logs (
             entity_type, entity_key, entity_name, employee_id, action, reason,
             old_values, new_values, changed_by_user_id
           ) VALUES ('employee', $1, $2, $3, 'created', $4, '{}'::JSONB, $5::JSONB, $6)`,
          [
            employee.employee_code,
            [employee.first_name, employee.middle_name, employee.last_name, employee.suffix].filter(Boolean).join(' '),
            employee.id,
            'Employee profile created after GSO approved requester identity.',
            JSON.stringify({
              employeeCode: employee.employee_code,
              firstName: employee.first_name,
              middleName: employee.middle_name,
              lastName: employee.last_name,
              suffix: employee.suffix,
              department: employee.department,
              position: employee.position,
              email: employee.email,
              status: employee.status,
            }),
            reviewedByUserId,
          ],
        );
      }
    }

    await client.query(
      `UPDATE requester_identity_profiles
          SET verification_status = $2,
              review_note = $3,
              reviewed_at = NOW(),
              reviewed_by_user_id = $4,
              updated_at = NOW()
        WHERE user_id = $1`,
      [userId, status, note, reviewedByUserId],
    );
    const reviewedProfile = await client.query(
      `${IDENTITY_SELECT} WHERE requester.id = $1 AND profile.user_id IS NOT NULL`,
      [userId],
    );
    await client.query('COMMIT');
    return reviewedProfile.rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505' && error.constraint === 'employees_employee_code_lower_unique_idx') {
      throw Object.assign(new Error('May employee record na gumagamit na ng employee number na ito. I-refresh ang queue at suriin ang record.'), { status: 409 });
    }
    if (error.code === '23505' && error.constraint === 'employees_email_lower_unique_idx') {
      throw Object.assign(new Error('May employee record na gumagamit na ng email na ito. Suriin ang Employee Master Data bago mag-approve.'), { status: 409 });
    }
    throw error;
  } finally {
    client.release();
  }
}

async function listReviewByUserId(userId) {
  const result = await pool.query(`${IDENTITY_SELECT} WHERE requester.id = $1 AND profile.user_id IS NOT NULL`, [userId]);
  return result.rows[0] || null;
}

module.exports = { getMine, isVerified, submitMine, listReviews, listReviewByUserId, review };
