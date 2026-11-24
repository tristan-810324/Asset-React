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

// Same identity fields as the Add account form, checked the same way. The account name is built from the names,
// as on create. IT Admin is accepted only so an IT Admin account can be saved unchanged; the service refuses to
// give or remove that role.
function validateUpdateSystemUser(body) {
  const { pictureData, ...details } = validateRequesterIdentity(body);
  const name = [details.firstName, details.middleName, details.lastName, details.suffix].filter(Boolean).join(' ');
  const email = normalizeEmail(body?.email);
  const roleKey = typeof body?.roleKey === 'string' ? body.roleKey : '';
  if (!creatableRoles.has(roleKey) && roleKey !== 'IT_ADMIN') {
    throw Object.assign(new Error('Choose an IT Staff, GSO Staff, GSO Head, or Requester account.'), { status: 400 });
  }
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 10) throw Object.assign(new Error('Explain the change in at least 10 characters.'), { status: 400 });
  if (reason.length > 500) throw Object.assign(new Error('The reason is too long (up to 500 characters).'), { status: 400 });
  return { ...details, name, email, roleKey, reason };
}

module.exports = { validateCreateSystemUser, validateUpdateSystemUser };
