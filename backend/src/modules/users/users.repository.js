const pool = require('../../config/db');

async function listGsoUsers() {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.is_active AS "isActive",
            u.email_verified_at AS "emailVerifiedAt", u.created_at AS "createdAt"
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
      WHERE r.role_key = 'GSO_STAFF'
      ORDER BY lower(u.name), lower(u.email)`,
  );
  return result.rows;
}

async function createGsoUser({ name, email, passwordHash }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const role = await client.query(
      "SELECT id FROM roles WHERE role_key = 'GSO_STAFF' FOR SHARE",
    );
    if (role.rowCount !== 1) {
      throw Object.assign(new Error('The GSO_STAFF role is not configured.'), { status: 500 });
    }

    const created = await client.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, is_active AS "isActive",
                 email_verified_at AS "emailVerifiedAt", created_at AS "createdAt"`,
      [name, email, passwordHash],
    );
    await client.query(
      'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
      [created.rows[0].id, role.rows[0].id],
    );
    await client.query('COMMIT');
    return created.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { listGsoUsers, createGsoUser };
