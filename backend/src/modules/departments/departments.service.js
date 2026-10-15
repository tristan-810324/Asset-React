const departmentsRepository = require('./departments.repository');
const { validateDepartment } = require('./departments.validation');

async function listDepartments() {
  return departmentsRepository.listDepartments();
}

async function createDepartment(input, user) {
  const department = validateDepartment(input);
  try {
    return await departmentsRepository.createDepartment({ ...department, createdByUserId: user.id });
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'departments_name_lower_unique_idx') {
      throw Object.assign(new Error('May department na kapareho ng pangalan na iyan.'), { status: 409 });
    }
    throw error;
  }
}

module.exports = { listDepartments, createDepartment };
