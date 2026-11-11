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

async function getDepartmentByName(name) {
  const result = await pool.query(
    `SELECT id::TEXT AS id, name
       FROM departments
      WHERE lower(name) = lower($1)`,
    [name],
  );
  return result.rows[0] || null;
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

async function writeEmployeeDepartmentLogs(client, employees, {
  previousDepartment,
  nextDepartment,
  reason,
  changedByUserId,
  action,
}) {
  for (const employee of employees) {
    const oldValues = employeeSnapshot(employee);
    const newValues = { ...oldValues, department: nextDepartment };
    await client.query(
      `INSERT INTO inventory_change_logs (
         entity_type, entity_key, entity_name, employee_id, action, reason,
         old_values, new_values, changed_by_user_id
       ) VALUES ('employee', $1, $2, $3, 'updated', $4, $5::JSONB, $6::JSONB, $7)`,
      [
        employee.employee_code,
        `${employee.first_name} ${employee.last_name}`,
        employee.id,
        `${action}: ${previousDepartment} to ${nextDepartment}. ${reason}`,
        JSON.stringify(oldValues),
        JSON.stringify(newValues),
        changedByUserId,
      ],
    );
  }
}

async function moveRequesterProfiles(client, previousDepartment, nextDepartment) {
  const result = await client.query(
    `UPDATE requester_identity_profiles
        SET department = $2,
            updated_at = NOW()
      WHERE lower(trim(department)) = lower(trim($1))`,
    [previousDepartment, nextDepartment],
  );
  return result.rowCount;
}

async function renameDepartment({ id, name, reason, changedByUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT id, name
         FROM departments
        WHERE id = $1
        FOR UPDATE`,
      [id],
    );
    const current = currentResult.rows[0];
    if (!current) throw Object.assign(new Error('Hindi na makita ang department.'), { status: 404 });
    if (current.name === name) {
      throw Object.assign(new Error('Walang pagbabago sa department name.'), { status: 409 });
    }

    const employeesResult = await client.query(
      `SELECT id, employee_code, first_name, middle_name, last_name, suffix,
              department, position, email, status
         FROM employees
        WHERE lower(trim(department)) = lower(trim($1))
        ORDER BY id
        FOR UPDATE`,
      [current.name],
    );
    const employees = employeesResult.rows;

    const updatedDepartment = await client.query(
      `UPDATE departments
          SET name = $2,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id::TEXT AS id, name`,
      [current.id, name],
    );
    if (employees.length) {
      await client.query(
        `UPDATE employees
            SET department = $2,
                updated_at = NOW()
          WHERE id = ANY($1::BIGINT[])`,
        [employees.map((employee) => employee.id), name],
      );
    }
    const updatedRequesterProfileCount = await moveRequesterProfiles(client, current.name, name);
    await writeEmployeeDepartmentLogs(client, employees, {
      previousDepartment: current.name,
      nextDepartment: name,
      reason,
      changedByUserId,
      action: 'Department renamed',
    });
    await client.query('COMMIT');
    return {
      department: updatedDepartment.rows[0],
      renamedEmployeeCount: employees.length,
      updatedRequesterProfileCount,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteDepartment({ id, replacementDepartmentId, reason, changedByUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (String(id) === String(replacementDepartmentId)) {
      throw Object.assign(new Error('Pumili ng ibang department na paglilipatan ng employees.'), { status: 400 });
    }
    const departmentsResult = await client.query(
      `SELECT id, name
         FROM departments
        WHERE id = ANY($1::BIGINT[])
        ORDER BY id
        FOR UPDATE`,
      [[id, replacementDepartmentId]],
    );
    if (departmentsResult.rowCount !== 2) {
      throw Object.assign(new Error('Hindi makita ang department o ang papalit na department.'), { status: 404 });
    }
    const source = departmentsResult.rows.find((department) => String(department.id) === String(id));
    const replacement = departmentsResult.rows.find((department) => String(department.id) === String(replacementDepartmentId));

    const employeesResult = await client.query(
      `SELECT id, employee_code, first_name, middle_name, last_name, suffix,
              department, position, email, status
         FROM employees
        WHERE lower(trim(department)) = lower(trim($1))
        ORDER BY id
        FOR UPDATE`,
      [source.name],
    );
    const employees = employeesResult.rows;
    if (employees.length) {
      await client.query(
        `UPDATE employees
            SET department = $2,
                updated_at = NOW()
          WHERE id = ANY($1::BIGINT[])`,
        [employees.map((employee) => employee.id), replacement.name],
      );
    }
    const updatedRequesterProfileCount = await moveRequesterProfiles(client, source.name, replacement.name);
    await writeEmployeeDepartmentLogs(client, employees, {
      previousDepartment: source.name,
      nextDepartment: replacement.name,
      reason,
      changedByUserId,
      action: 'Department deleted and reassigned',
    });
    await client.query('DELETE FROM departments WHERE id = $1', [source.id]);
    await client.query('COMMIT');
    return {
      deletedDepartmentId: String(source.id),
      replacementDepartment: { id: String(replacement.id), name: replacement.name },
      reassignedEmployeeCount: employees.length,
      updatedRequesterProfileCount,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listDepartments,
  createDepartment,
  getDepartmentByName,
  renameDepartment,
  deleteDepartment,
};
