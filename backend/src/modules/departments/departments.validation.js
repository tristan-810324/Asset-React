function validateDepartment(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.name !== 'string') {
    throw Object.assign(new Error('Enter a department name.'), { status: 400 });
  }

  const name = input.name.trim();
  if (!name) throw Object.assign(new Error('Enter a department name.'), { status: 400 });
  if (name.length > 120) throw Object.assign(new Error('Department name must be 120 characters or less.'), { status: 400 });
  return { name };
}

function validateDepartmentId(value) {
  const id = String(value ?? '').trim();
  if (!/^\d{1,20}$/.test(id) || id === '0') {
    throw Object.assign(new Error('Invalid department reference.'), { status: 400 });
  }
  return id;
}

function validateReason(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw Object.assign(new Error('Enter a reason for the change.'), { status: 400 });
  }
  const reason = value.trim();
  if (reason.length > 500) {
    throw Object.assign(new Error('The reason must be 500 characters or less.'), { status: 400 });
  }
  return reason;
}

function validateDepartmentRename(input) {
  return { ...validateDepartment(input), reason: validateReason(input?.reason) };
}

function validateDepartmentDeletion(input) {
  const replacementDepartmentId = validateDepartmentId(input?.replacementDepartmentId);
  return { replacementDepartmentId, reason: validateReason(input?.reason) };
}

module.exports = {
  validateDepartment,
  validateDepartmentId,
  validateDepartmentRename,
  validateDepartmentDeletion,
};
