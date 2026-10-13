const { normalizeEmail } = require('../auth/auth.validation');

function validateCreateGsoAccount(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 200) {
    throw Object.assign(new Error('Enter a staff name between 1 and 200 characters.'), { status: 400 });
  }

  return { name, email: normalizeEmail(body?.email) };
}

module.exports = { validateCreateGsoAccount };
