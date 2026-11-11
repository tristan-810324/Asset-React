function validateDepartment(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.name !== 'string') {
    throw Object.assign(new Error('Maglagay ng department name.'), { status: 400 });
  }

  const name = input.name.trim();
  if (!name) throw Object.assign(new Error('Maglagay ng department name.'), { status: 400 });
  if (name.length > 120) throw Object.assign(new Error('Hindi dapat lumampas sa 120 characters ang department name.'), { status: 400 });
  return { name };
}

function validateDepartmentId(value) {
  const id = String(value ?? '').trim();
  if (!/^\d{1,20}$/.test(id) || id === '0') {
    throw Object.assign(new Error('Hindi valid ang department reference.'), { status: 400 });
  }
  return id;
}

function validateReason(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw Object.assign(new Error('Pakilagay ang dahilan ng pagbabago.'), { status: 400 });
  }
  const reason = value.trim();
  if (reason.length > 500) {
    throw Object.assign(new Error('Hindi dapat lumampas sa 500 characters ang dahilan ng pagbabago.'), { status: 400 });
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
