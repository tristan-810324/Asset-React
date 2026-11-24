const pool = require('../../config/db');

async function listSystemUsers() {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email,
            COALESCE(NULLIF(u.position, ''), MAX(employee.position), '') AS position,
            COALESCE(
              array_agg(DISTINCT r.role_key) FILTER (WHERE r.role_key IS NOT NULL),
              ARRAY[]::TEXT[]
            ) AS roles,
            u.is_active AS "isActive",
            u.email_verified_at AS "emailVerifiedAt",
            u.created_at AS "createdAt"
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN employees employee ON lower(employee.email) = lower(u.email)
      GROUP BY u.id
      ORDER BY lower(u.name), lower(u.email)`,
  );
  return result.rows;
}

// Same sources the page text promises: saved positions, active employee records, and existing user accounts.
async function listAccountPositions() {
  const result = await pool.query(
    `SELECT DISTINCT ON (lower(position)) position
       FROM (
         SELECT name AS position FROM employee_positions
         UNION ALL
         SELECT "position" FROM employees WHERE status = 'Active'
         UNION ALL
         SELECT "position" FROM users
         UNION ALL
         SELECT * FROM (VALUES ('Head'), ('Others')) AS defaults(position)
       ) AS options
      WHERE BTRIM(position) <> ''
      ORDER BY lower(position), position`,
  );
  return result.rows.map((row) => row.position).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

async function createSystemUser({ name, email, roleKey, position, passwordHash }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const role = await client.query(
      'SELECT id FROM roles WHERE role_key = $1 FOR SHARE',
      [roleKey],
    );
    if (role.rowCount !== 1) {
      throw Object.assign(new Error(`The ${roleKey} role is not configured.`), { status: 500 });
    }

    const created = await client.query(
      `INSERT INTO users (name, email, position, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, position, is_active AS "isActive",
                 email_verified_at AS "emailVerifiedAt", created_at AS "createdAt"`,
      [name, email, position, passwordHash],
    );
    await client.query(
      'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
      [created.rows[0].id, role.rows[0].id],
    );
    await client.query('COMMIT');
    return { ...created.rows[0], roles: [roleKey] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function setSystemUserActive(userId, isActive) {
  const result = await pool.query(
    'UPDATE users SET is_active = $2 WHERE id = $1 RETURNING id, name, email, is_active AS "isActive"',
    [userId, isActive],
  );
  return result.rows[0] || null;
}

async function getSystemUserForEdit(userId) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.position,
            COALESCE(array_agg(r.role_key ORDER BY r.role_key) FILTER (WHERE r.role_key IS NOT NULL), ARRAY[]::TEXT[]) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.id = $1
      GROUP BY u.id`,
    [userId],
  );
  return result.rows[0] || null;
}

// A new email must verify again and the old sessions are signed out (token_version). The identity profile keeps its
// verification status; a profile created here starts as Verified, the same result as an IT-created account on create.
// A role change replaces the roles.
async function updateSystemUser({ userId, name, email, roleKey, emailChanged, roleChanged, identity }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE users
          SET name = $2, email = $3, position = $4,
              email_verified_at = CASE WHEN $5::BOOLEAN THEN NULL ELSE email_verified_at END,
              token_version = CASE WHEN $5::BOOLEAN THEN token_version + 1 ELSE token_version END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, email, position`,
      [userId, name, email, identity.position, emailChanged],
    );
    await client.query(
      `INSERT INTO requester_identity_profiles
         (user_id, employee_code, first_name, middle_name, last_name, suffix, department, position, contact_number, verification_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Verified')
       ON CONFLICT (user_id) DO UPDATE
         SET employee_code = EXCLUDED.employee_code, first_name = EXCLUDED.first_name,
             middle_name = EXCLUDED.middle_name, last_name = EXCLUDED.last_name, suffix = EXCLUDED.suffix,
             department = EXCLUDED.department, position = EXCLUDED.position, contact_number = EXCLUDED.contact_number,
             updated_at = NOW()`,
      [userId, identity.employeeCode, identity.firstName, identity.middleName, identity.lastName, identity.suffix,
        identity.department, identity.position, identity.contactNumber],
    );
    if (roleChanged) {
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
      await client.query(
        'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE role_key = $2',
        [userId, roleKey],
      );
    }
    await client.query('COMMIT');
    return updated.rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Removes the sign-in tokens and role links first. Requests and issuance batches still reference the
// account (ON DELETE RESTRICT), so the delete fails with 23503 when the account has any history.
async function deleteSystemUser(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM auth_tokens WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
    const result = await client.query('DELETE FROM users WHERE id = $1 RETURNING id, name, email', [userId]);
    await client.query('COMMIT');
    return result.rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { listSystemUsers, listAccountPositions, createSystemUser, setSystemUserActive, getSystemUserForEdit, updateSystemUser, deleteSystemUser };
