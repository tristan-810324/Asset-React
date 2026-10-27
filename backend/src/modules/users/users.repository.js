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

async function listAccountPositions() {
  const result = await pool.query(
    `SELECT position
       FROM (
         SELECT DISTINCT trim(employee.position) AS position
           FROM employees employee
          WHERE employee.status = 'Active'
            AND length(trim(employee.position)) > 0
         UNION
         SELECT DISTINCT trim(user_account.position) AS position
           FROM users user_account
          WHERE length(trim(user_account.position)) > 0
       ) AS available_positions
      ORDER BY lower(position), position`,
  );
  return result.rows.map((row) => row.position);
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

module.exports = { listSystemUsers, listAccountPositions, createSystemUser };
