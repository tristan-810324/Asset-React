const { normalizeEmail } = require('../auth/auth.validation');

const creatableRoles = new Set(['BORROWER', 'GSO_STAFF', 'IT_STAFF']);

function validateCreateSystemUser(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 200) {
    throw Object.assign(new Error('Enter a name between 1 and 200 characters.'), { status: 400 });
  }

  const roleKey = typeof body?.roleKey === 'string' ? body.roleKey : '';
  if (!creatableRoles.has(roleKey)) {
    throw Object.assign(new Error('Choose a Requester, GSO Staff, or IT Staff account.'), { status: 400 });
  }

  const position = typeof body?.position === 'string' ? body.position.trim() : '';
  if (!position || position.length > 120) {
    throw Object.assign(new Error('Select a position between 1 and 120 characters.'), { status: 400 });
  }

  return { name, email: normalizeEmail(body?.email), roleKey, position };
}

module.exports = { validateCreateSystemUser };
