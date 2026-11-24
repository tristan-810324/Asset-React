function invalid(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function requiredText(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim()) invalid(`Enter the ${label}.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) invalid(`${label} must be ${maxLength} characters or less.`);
  return trimmed;
}

function optionalText(value, label, maxLength) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') invalid(`Invalid ${label}.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) invalid(`${label} must be ${maxLength} characters or less.`);
  return trimmed;
}

function optionalPictureData(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 1_400_000) {
    invalid('The employee picture must be 1 MB or smaller.');
  }
  if (!/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value)) {
    invalid('Invalid employee picture. Use a JPG, PNG, WebP, or GIF file.');
  }
  return value;
}

function validateEmployee(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Invalid employee profile.');

  const employee = {
    employeeCode: requiredText(input.employeeCode, 'employee code', 40),
    department: requiredText(input.department, 'department', 120),
    firstName: requiredText(input.firstName, 'first name', 100),
    middleName: optionalText(input.middleName, 'middle name', 100),
    lastName: requiredText(input.lastName, 'last name', 100),
    suffix: optionalText(input.suffix, 'suffix', 40),
    position: requiredText(input.position, 'position', 120),
    email: requiredText(input.email, 'email', 254),
    status: input.status,
    pictureData: optionalPictureData(input.pictureData),
  };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employee.email)) invalid('Enter a valid email address.');
  if (employee.status !== 'Active' && employee.status !== 'Inactive') invalid('Invalid employment status.');
  return employee;
}

function validateUpdateEmployee(input) {
  const employee = validateEmployee(input);
  employee.reason = requiredText(input.reason, 'reason for changing this profile', 500);
  return employee;
}

function validateMasterDataId(value, label) {
  const id = String(value ?? '').trim();
  if (!/^\d{1,20}$/.test(id) || id === '0') invalid(`Invalid ${label} reference.`);
  return id;
}

function validatePosition(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Invalid position details.');
  return { name: requiredText(input.name, 'position name', 120) };
}

function validatePositionRename(input) {
  return {
    ...validatePosition(input),
    reason: requiredText(input?.reason, 'reason for changing this position', 500),
  };
}

function validatePositionDeletion(input) {
  return {
    replacementPositionId: validateMasterDataId(input?.replacementPositionId, 'replacement position'),
    reason: requiredText(input?.reason, 'reason for deleting this position', 500),
  };
}

module.exports = {
  validateEmployee,
  validateUpdateEmployee,
  validateMasterDataId,
  validatePosition,
  validatePositionRename,
  validatePositionDeletion,
};
