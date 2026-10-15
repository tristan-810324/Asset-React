function validateDepartment(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.name !== 'string') {
    throw Object.assign(new Error('Maglagay ng department name.'), { status: 400 });
  }

  const name = input.name.trim();
  if (!name) throw Object.assign(new Error('Maglagay ng department name.'), { status: 400 });
  if (name.length > 120) throw Object.assign(new Error('Hindi dapat lumampas sa 120 characters ang department name.'), { status: 400 });
  return { name };
}

module.exports = { validateDepartment };
