const { normalizeEmail } = require('../auth/auth.validation');
const { validateRequesterIdentity } = require('../requester-identity/requester-identity.service');

const creatableRoles = new Set(['BORROWER', 'GSO_STAFF', 'GSO_HEAD', 'IT_STAFF']);

// Same identity fields as the requester form. IT/GSO-created accounts skip the review because IT is the approver.
function validateCreateSystemUser(body) {
  const identity = validateRequesterIdentity(body);

  const roleKey = typeof body?.roleKey === 'string' ? body.roleKey : '';
  if (!creatableRoles.has(roleKey)) {
    throw Object.assign(new Error('Choose an IT Staff, GSO Staff, GSO Head, or Requester account.'), { status: 400 });
  }

  const name = [identity.firstName, identity.middleName, identity.lastName, identity.suffix].filter(Boolean).join(' ');
  return { ...identity, name, email: normalizeEmail(body?.email), roleKey };
}

module.exports = { validateCreateSystemUser };
