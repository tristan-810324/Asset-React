const pool = require('../../config/db');

const employeeColumns = `
  employee.employee_code AS id,
  employee.first_name AS "firstName",
  employee.last_name AS "lastName",
  employee.department,
  employee.position,
  employee.email,
  employee.status,
  COALESCE((
    SELECT COALESCE(SUM(issuance.quantity - issuance.returned_quantity), 0)::INTEGER
      FROM employee_issuances AS issuance
     WHERE issuance.employee_id = employee.id
       AND issuance.status = 'Issued'
  ), 0) AS "assignedCount",
  COALESCE((
    SELECT json_agg(json_build_object(
      'changedAt', change.changed_at,
      'changedBy', actor.name,
      'reason', change.reason
    ) ORDER BY change.changed_at DESC, change.id DESC)
      FROM inventory_change_logs AS change
      LEFT JOIN users AS actor ON actor.id = change.changed_by_user_id
     WHERE change.employee_id = employee.id
       AND change.action = 'updated'
  ), '[]'::JSON) AS "changeHistory"
`;

async function getEmployee(queryable, employeeCode) {
  const result = await queryable.query(
    `SELECT ${employeeColumns}
       FROM employees AS employee
      WHERE lower(employee.employee_code) = lower($1)`,
    [employeeCode],
  );
  return result.rows[0] || null;
}

async function listEmployees() {
  const result = await pool.query(
    `SELECT ${employeeColumns}
       FROM employees AS employee
      ORDER BY lower(employee.last_name), lower(employee.first_name), employee.id`,
  );
  return result.rows;
}

function employeeSnapshot(employee) {
  return {
    employeeCode: employee.employee_code,
    firstName: employee.first_name,
    lastName: employee.last_name,
    department: employee.department,
    position: employee.position,
    email: employee.email,
    status: employee.status,
  };
}

async function createEmployee(employee, { createdByUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO employees (
         employee_code, first_name, last_name, department, position, email, status, created_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        employee.employeeCode,
        employee.firstName,
        employee.lastName,
        employee.department,
        employee.position,
        employee.email,
        employee.status,
        createdByUserId,
      ],
    );
    const id = result.rows[0].id;
    const created = await client.query('SELECT * FROM employees WHERE id = $1', [id]);
    const row = created.rows[0];

    await client.query(
      `INSERT INTO inventory_change_logs (
         entity_type, entity_key, entity_name, employee_id, action, reason,
         old_values, new_values, changed_by_user_id
       ) VALUES ('employee', $1, $2, $3, 'created', 'New employee profile created.', '{}'::JSONB, $4::JSONB, $5)`,
      [
        row.employee_code,
        `${row.first_name} ${row.last_name}`,
        id,
        JSON.stringify(employeeSnapshot(row)),
        createdByUserId,
      ],
    );

    const employeeWithHistory = await getEmployee(client, row.employee_code);
    await client.query('COMMIT');
    return employeeWithHistory;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateEmployee(previousCode, employee, { changedByUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const previousResult = await client.query(
      'SELECT * FROM employees WHERE lower(employee_code) = lower($1) FOR UPDATE',
      [previousCode],
    );
    const previous = previousResult.rows[0];
    if (!previous) throw Object.assign(new Error('Hindi na makita ang employee profile na ie-edit.'), { status: 404 });

    await client.query(
      `UPDATE employees
          SET employee_code = $2,
              first_name = $3,
              last_name = $4,
              department = $5,
              position = $6,
              email = $7,
              status = $8,
              updated_at = NOW()
        WHERE id = $1`,
      [
        previous.id,
        employee.employeeCode,
        employee.firstName,
        employee.lastName,
        employee.department,
        employee.position,
        employee.email,
        employee.status,
      ],
    );

    const updatedResult = await client.query('SELECT * FROM employees WHERE id = $1', [previous.id]);
    const updated = updatedResult.rows[0];
    await client.query(
      `INSERT INTO inventory_change_logs (
         entity_type, entity_key, entity_name, employee_id, action, reason,
         old_values, new_values, changed_by_user_id
       ) VALUES ('employee', $1, $2, $3, 'updated', $4, $5::JSONB, $6::JSONB, $7)`,
      [
        updated.employee_code,
        `${updated.first_name} ${updated.last_name}`,
        updated.id,
        employee.reason,
        JSON.stringify(employeeSnapshot(previous)),
        JSON.stringify(employeeSnapshot(updated)),
        changedByUserId,
      ],
    );

    const employeeWithHistory = await getEmployee(client, updated.employee_code);
    await client.query('COMMIT');
    return employeeWithHistory;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { listEmployees, createEmployee, updateEmployee };
