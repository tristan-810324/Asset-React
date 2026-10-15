const pool = require('../../config/db');

async function listDepartments() {
  const result = await pool.query(
    `SELECT id::TEXT AS id, name
       FROM departments
      ORDER BY lower(name), id`,
  );
  return result.rows;
}

async function createDepartment({ name, createdByUserId }) {
  const result = await pool.query(
    `INSERT INTO departments (name, created_by_user_id)
     VALUES ($1, $2)
     RETURNING id::TEXT AS id, name`,
    [name, createdByUserId],
  );
  return result.rows[0];
}

module.exports = { listDepartments, createDepartment };
