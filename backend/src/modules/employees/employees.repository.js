const pool = require('../../config/db');

// Return codes and receipts go to the employee's email, so it stays fixed while anything is open:
// items still out, an issuance or return awaiting a decision, or a lost item not yet settled.
const emailLockedSql = `(
  EXISTS (
    SELECT 1
      FROM employee_issuances AS open_issue
      JOIN item_catalog AS open_item ON open_item.id = open_issue.item_id
     WHERE open_issue.employee_id = employee.id
       AND (open_issue.status = 'Pending'
         OR (open_issue.status = 'Issued' AND open_issue.quantity > open_issue.returned_quantity
             AND open_item.issue_behavior = 'returnable'))
  ) OR EXISTS (
    SELECT 1
      FROM employee_issuance_returns AS open_return
      JOIN employee_issuances AS returned_issue ON returned_issue.id = open_return.issuance_id
     WHERE returned_issue.employee_id = employee.id
       AND (open_return.status = 'Pending' OR (open_return.status = 'Lost' AND open_return.settlement_status = 'Pending'))
  )
)`;

const employeeColumns = `
  employee.employee_code AS id,
  employee.first_name AS "firstName",
  employee.middle_name AS "middleName",
  employee.last_name AS "lastName",
  employee.suffix,
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
  ${emailLockedSql} AS "emailLocked",
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

async function listEmployeePositions() {
  const result = await pool.query(
    `SELECT id::TEXT AS id, name
       FROM employee_positions
      ORDER BY lower(name), id`,
  );
  return result.rows;
}

async function getEmployeePositionByName(name) {
  const result = await pool.query(
    `SELECT id::TEXT AS id, name
       FROM employee_positions
      WHERE lower(name) = lower($1)`,
    [name],
  );
  return result.rows[0] || null;
}

async function createEmployeePosition({ name, createdByUserId }) {
  const result = await pool.query(
    `INSERT INTO employee_positions (name, created_by_user_id)
     VALUES ($1, $2)
     RETURNING id::TEXT AS id, name`,
    [name, createdByUserId],
  );
  return result.rows[0];
}

function employeeSnapshot(employee) {
  return {
    employeeCode: employee.employee_code,
    firstName: employee.first_name,
    middleName: employee.middle_name,
    lastName: employee.last_name,
    suffix: employee.suffix,
    department: employee.department,
    position: employee.position,
    email: employee.email,
    status: employee.status,
  };
}

async function writeEmployeePositionLogs(client, employees, {
  previousPosition,
  nextPosition,
  reason,
  changedByUserId,
  action,
}) {
  for (const employee of employees) {
    const oldValues = employeeSnapshot(employee);
    const newValues = { ...oldValues, position: nextPosition };
    await client.query(
      `INSERT INTO inventory_change_logs (
         entity_type, entity_key, entity_name, employee_id, action, reason,
         old_values, new_values, changed_by_user_id
       ) VALUES ('employee', $1, $2, $3, 'updated', $4, $5::JSONB, $6::JSONB, $7)`,
      [
        employee.employee_code,
        `${employee.first_name} ${employee.last_name}`,
        employee.id,
        `${action}: ${previousPosition} to ${nextPosition}. ${reason}`,
        JSON.stringify(oldValues),
        JSON.stringify(newValues),
        changedByUserId,
      ],
    );
  }
}

async function moveRequesterProfilesAndUsersForPosition(client, previousPosition, nextPosition) {
  const [profiles, users] = await Promise.all([
    client.query(
      `UPDATE requester_identity_profiles
          SET position = $2,
              updated_at = NOW()
        WHERE lower(trim(position)) = lower(trim($1))`,
      [previousPosition, nextPosition],
    ),
    client.query(
      `UPDATE users
          SET position = $2,
              updated_at = NOW()
        WHERE lower(trim(position)) = lower(trim($1))`,
      [previousPosition, nextPosition],
    ),
  ]);
  return { updatedRequesterProfileCount: profiles.rowCount, updatedUserCount: users.rowCount };
}

async function renameEmployeePosition({ id, name, reason, changedByUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT id, name
         FROM employee_positions
        WHERE id = $1
        FOR UPDATE`,
      [id],
    );
    const current = currentResult.rows[0];
    if (!current) throw Object.assign(new Error('Hindi na makita ang position.'), { status: 404 });
    if (current.name === name) throw Object.assign(new Error('Walang pagbabago sa position name.'), { status: 409 });

    const employeesResult = await client.query(
      `SELECT id, employee_code, first_name, middle_name, last_name, suffix,
              department, position, email, status
         FROM employees
        WHERE lower(trim(position)) = lower(trim($1))
        ORDER BY id
        FOR UPDATE`,
      [current.name],
    );
    const employees = employeesResult.rows;
    const updatedPosition = await client.query(
      `UPDATE employee_positions
          SET name = $2,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id::TEXT AS id, name`,
      [current.id, name],
    );
    if (employees.length) {
      await client.query(
        `UPDATE employees
            SET position = $2,
                updated_at = NOW()
          WHERE id = ANY($1::BIGINT[])`,
        [employees.map((employee) => employee.id), name],
      );
    }
    const propagated = await moveRequesterProfilesAndUsersForPosition(client, current.name, name);
    await writeEmployeePositionLogs(client, employees, {
      previousPosition: current.name,
      nextPosition: name,
      reason,
      changedByUserId,
      action: 'Position renamed',
    });
    await client.query('COMMIT');
    return { position: updatedPosition.rows[0], renamedEmployeeCount: employees.length, ...propagated };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteEmployeePosition({ id, replacementPositionId, reason, changedByUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (String(id) === String(replacementPositionId)) {
      throw Object.assign(new Error('Pumili ng ibang position na paglilipatan ng records.'), { status: 400 });
    }
    const positionsResult = await client.query(
      `SELECT id, name
         FROM employee_positions
        WHERE id = ANY($1::BIGINT[])
        ORDER BY id
        FOR UPDATE`,
      [[id, replacementPositionId]],
    );
    if (positionsResult.rowCount !== 2) {
      throw Object.assign(new Error('Hindi makita ang position o ang papalit na position.'), { status: 404 });
    }
    const source = positionsResult.rows.find((position) => String(position.id) === String(id));
    const replacement = positionsResult.rows.find((position) => String(position.id) === String(replacementPositionId));

    const employeesResult = await client.query(
      `SELECT id, employee_code, first_name, middle_name, last_name, suffix,
              department, position, email, status
         FROM employees
        WHERE lower(trim(position)) = lower(trim($1))
        ORDER BY id
        FOR UPDATE`,
      [source.name],
    );
    const employees = employeesResult.rows;
    if (employees.length) {
      await client.query(
        `UPDATE employees
            SET position = $2,
                updated_at = NOW()
          WHERE id = ANY($1::BIGINT[])`,
        [employees.map((employee) => employee.id), replacement.name],
      );
    }
    const propagated = await moveRequesterProfilesAndUsersForPosition(client, source.name, replacement.name);
    await writeEmployeePositionLogs(client, employees, {
      previousPosition: source.name,
      nextPosition: replacement.name,
      reason,
      changedByUserId,
      action: 'Position deleted and reassigned',
    });
    await client.query('DELETE FROM employee_positions WHERE id = $1', [source.id]);
    await client.query('COMMIT');
    return {
      deletedPositionId: String(source.id),
      replacementPosition: { id: String(replacement.id), name: replacement.name },
      reassignedEmployeeCount: employees.length,
      ...propagated,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function createEmployee(employee, { createdByUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO employees (
         employee_code, first_name, middle_name, last_name, suffix, department, position,
         email, status, picture_data, created_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        employee.employeeCode,
        employee.firstName,
        employee.middleName,
        employee.lastName,
        employee.suffix,
        employee.department,
        employee.position,
        employee.email,
        employee.status,
        employee.pictureData,
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
    const emailChanged = String(previous.email || '').toLowerCase() !== String(employee.email || '').toLowerCase();
    if (emailChanged) {
      const lock = await client.query(`SELECT ${emailLockedSql} AS locked FROM employees AS employee WHERE employee.id = $1`, [previous.id]);
      if (lock.rows[0].locked) {
        throw Object.assign(new Error('Hindi mapapalitan ang email habang may hawak pang item, nakabinbing issuance o return, o hindi pa nase-settle na nawalang item ang employee. Tapusin muna ang mga iyon.'), { status: 409 });
      }
    }

    await client.query(
      `UPDATE employees
          SET employee_code = $2,
              first_name = $3,
              middle_name = $4,
              last_name = $5,
              suffix = $6,
              department = $7,
              position = $8,
              email = $9,
              status = $10,
              updated_at = NOW()
        WHERE id = $1`,
      [
        previous.id,
        employee.employeeCode,
        employee.firstName,
        employee.middleName,
        employee.lastName,
        employee.suffix,
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
    return { employee: employeeWithHistory, previousEmail: emailChanged ? previous.email : null };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listEmployees,
  listEmployeePositions,
  getEmployeePositionByName,
  createEmployeePosition,
  renameEmployeePosition,
  deleteEmployeePosition,
  createEmployee,
  updateEmployee,
};
