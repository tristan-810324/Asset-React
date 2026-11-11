const departmentsRepository = require('./departments.repository');
const {
  validateDepartment,
  validateDepartmentId,
  validateDepartmentRename,
  validateDepartmentDeletion,
} = require('./departments.validation');

function translateDuplicate(error) {
  if (error.code === '23505' && error.constraint === 'departments_name_lower_unique_idx') {
    throw Object.assign(new Error('May department na kapareho ng pangalan na iyan.'), { status: 409 });
  }
}

async function listDepartments() {
  return departmentsRepository.listDepartments();
}

async function createDepartment(input, user) {
  const department = validateDepartment(input);
  try {
    return await departmentsRepository.createDepartment({ ...department, createdByUserId: user.id });
  } catch (error) {
    translateDuplicate(error);
    throw error;
  }
}

async function renameDepartment(departmentIdValue, input, user) {
  const id = validateDepartmentId(departmentIdValue);
  const department = validateDepartmentRename(input);
  try {
    return await departmentsRepository.renameDepartment({ id, ...department, changedByUserId: user.id });
  } catch (error) {
    translateDuplicate(error);
    throw error;
  }
}

async function deleteDepartment(departmentIdValue, input, user) {
  const id = validateDepartmentId(departmentIdValue);
  const deletion = validateDepartmentDeletion(input);
  return departmentsRepository.deleteDepartment({ id, ...deletion, changedByUserId: user.id });
}

module.exports = { listDepartments, createDepartment, renameDepartment, deleteDepartment };
