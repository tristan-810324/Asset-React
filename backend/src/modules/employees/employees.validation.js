function invalid(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function requiredText(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim()) invalid(`Pakilagay ang ${label}.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) invalid(`Hindi dapat lumampas sa ${maxLength} characters ang ${label}.`);
  return trimmed;
}

function optionalText(value, label, maxLength) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') invalid(`Hindi valid ang ${label}.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) invalid(`Hindi dapat lumampas sa ${maxLength} characters ang ${label}.`);
  return trimmed;
}

function optionalPictureData(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 1_400_000) {
    invalid('Ang employee picture ay dapat 1 MB o mas maliit.');
  }
  if (!/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value)) {
    invalid('Hindi valid ang employee picture. Gumamit ng JPG, PNG, WebP, o GIF.');
  }
  return value;
}

function validateEmployee(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Hindi valid ang employee profile.');

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

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employee.email)) invalid('Maglagay ng valid na email address.');
  if (employee.status !== 'Active' && employee.status !== 'Inactive') invalid('Hindi valid ang employment status.');
  return employee;
}

function validateUpdateEmployee(input) {
  const employee = validateEmployee(input);
  employee.reason = requiredText(input.reason, 'reason for changing this profile', 500);
  return employee;
}

module.exports = { validateEmployee, validateUpdateEmployee };
