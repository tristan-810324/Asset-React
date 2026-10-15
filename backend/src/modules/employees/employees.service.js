const employeesRepository = require('./employees.repository');
const { validateEmployee, validateUpdateEmployee } = require('./employees.validation');

function validateEmployeeCode(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 40) {
    throw Object.assign(new Error('Hindi valid ang employee code na ie-edit.'), { status: 400 });
  }
  return value.trim();
}

function translateDuplicate(error) {
  if (error.code === '23505' && error.constraint === 'employees_employee_code_lower_unique_idx') {
    throw Object.assign(new Error('May employee profile na gumagamit ng Employee Code na iyan.'), { status: 409 });
  }
  if (error.code === '23505' && error.constraint === 'employees_email_lower_unique_idx') {
    throw Object.assign(new Error('May employee profile na gumagamit ng email address na iyan.'), { status: 409 });
  }
}

async function listEmployees() {
  return employeesRepository.listEmployees();
}

async function createEmployee(input, user) {
  const employee = validateEmployee(input);
  try {
    return await employeesRepository.createEmployee(employee, { createdByUserId: user.id });
  } catch (error) {
    translateDuplicate(error);
    throw error;
  }
}

async function updateEmployee(employeeCodeValue, input, user) {
  const employeeCode = validateEmployeeCode(employeeCodeValue);
  const employee = validateUpdateEmployee(input);
  try {
    return await employeesRepository.updateEmployee(employeeCode, employee, { changedByUserId: user.id });
  } catch (error) {
    translateDuplicate(error);
    throw error;
  }
}

module.exports = { listEmployees, createEmployee, updateEmployee };
