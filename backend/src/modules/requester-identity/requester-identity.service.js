const repository = require('./requester-identity.repository');
const notificationsRepository = require('../notifications/notifications.repository');

function invalid(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function requiredText(value, label, maximum) {
  if (typeof value !== 'string' || !value.trim()) invalid(`${label} ay kailangan.`);
  const normalized = value.trim();
  if (normalized.length > maximum) invalid(`${label} ay hindi dapat lumampas sa ${maximum} characters.`);
  return normalized;
}

function optionalText(value, label, maximum) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') invalid(`Hindi valid ang ${label}.`);
  const normalized = value.trim();
  if (normalized.length > maximum) invalid(`Ang ${label} ay hindi dapat lumampas sa ${maximum} characters.`);
  return normalized;
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

function validateRequesterIdentity(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Hindi valid ang requester identity details.');
  const employeeCode = requiredText(input.employeeCode, 'Employee number', 40);
  const firstName = requiredText(input.firstName, 'First name', 100);
  const middleName = optionalText(input.middleName, 'Middle name', 100);
  const lastName = requiredText(input.lastName, 'Surname', 100);
  const suffix = optionalText(input.suffix, 'Suffix', 40);
  const department = requiredText(input.department, 'Department / office', 120);
  const position = requiredText(input.position, 'Position', 120);
  const contactNumber = requiredText(input.contactNumber, 'Contact number', 30);
  const pictureData = optionalPictureData(input.pictureData);
  const digits = contactNumber.replace(/\D/g, '');
  if (!/^[0-9+().\-\s]{7,30}$/.test(contactNumber) || digits.length < 7 || digits.length > 20) {
    invalid('Maglagay ng valid na contact number.');
  }
  return { employeeCode, firstName, middleName, lastName, suffix, department, position, contactNumber, pictureData };
}

function validateUserId(value) {
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value) || value === '0') invalid('Hindi valid ang requester account ID.');
  return value;
}

async function getMine(user) {
  return repository.getMine(user.id);
}

async function submitMine(input, user) {
  const identity = validateRequesterIdentity(input);
  const current = await repository.getMine(user.id);
  if (!current) invalid('Hindi makita ang requester account.', 404);
  if (current.status === 'Pending') invalid('Nasa GSO na ang iyong identity details para sa review. Hintayin muna ang resulta.', 409);
  const profile = await repository.submitMine(user.id, identity);

  // Notify GSO Staff that a new requester account needs verification
  await notificationsRepository.createRoleNotification({
    roleKey: 'GSO_STAFF',
    type: 'REQUESTER_VERIFICATION_PENDING',
    title: 'New requester account to verify',
    message: `${user.name || 'A requester'} submitted their identity details for verification.`,
    href: '/gso/requester-verification',
    dedupeKey: `requester-verification-pending:${user.id}`,
  });

  return profile;
}

async function listReviews(statusValue) {
  const status = typeof statusValue === 'string' ? statusValue.trim() : 'all';
  if (!['all', 'Pending', 'Verified', 'Needs Correction'].includes(status)) invalid('Hindi valid ang verification status filter.');
  return repository.listReviews(status);
}

async function getReviewPicture(userIdValue) {
  return repository.getPicture(validateUserId(userIdValue));
}

async function review(userIdValue, input, reviewer) {
  const userId = validateUserId(userIdValue);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Hindi valid ang verification decision.');
  const status = input.status;
  if (!['Verified', 'Needs Correction'].includes(status)) invalid('Pumili ng valid na verification decision.');
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > 1000) invalid('Ang review note ay hindi dapat lumampas sa 1000 characters.');
  if (status === 'Needs Correction' && !note) invalid('Maglagay ng note para malaman ng requester kung ano ang dapat ayusin.');
  const department = input.department === undefined ? undefined : requiredText(input.department, 'Department / office', 120);
  const position = input.position === undefined ? undefined : requiredText(input.position, 'Position', 120);
  const addDepartment = input.addDepartment === undefined ? false : input.addDepartment;
  const addPosition = input.addPosition === undefined ? false : input.addPosition;
  if (typeof addDepartment !== 'boolean' || typeof addPosition !== 'boolean') invalid('Hindi valid ang master data decision.');
  if (addDepartment && !department) invalid('Pumili o maglagay ng department / office bago mag-approve.');
  if (addPosition && !position) invalid('Pumili o maglagay ng position bago mag-approve.');
  const current = await repository.listReviewByUserId(userId);
  if (!current) invalid('Hindi makita ang requester identity na rerepasuhin.', 404);
  if (status === 'Verified' && current.matchedEmployeeCode && !current.employeeRecordMatch && !note) {
    invalid('Maglagay ng review note kung mano-manong ive-verify ang profile na hindi eksaktong tumugma sa Employee Master Data.');
  }
  const profile = await repository.review(userId, {
    status,
    note,
    department,
    position,
    addDepartment,
    addPosition,
    reviewedByUserId: reviewer.id,
  });
  if (!profile) invalid('Hindi makita ang requester identity na rerepasuhin.', 404);

  // Resolve the pending verification notification since the review is complete
  await notificationsRepository.resolveByPrefix(`requester-verification-pending:${userId}`);

  // Notify the requester of the result
  if (status === 'Verified') {
    await notificationsRepository.createUserNotification({
      userId: String(userId),
      type: 'REQUESTER_VERIFIED',
      title: 'Your account has been verified!',
      message: 'Your identity has been approved by GSO Staff. You can now submit service requests.',
      href: '/requester/request-center',
      dedupeKey: `requester-verified:${userId}`,
    });
  } else if (status === 'Needs Correction') {
    await notificationsRepository.createUserNotification({
      userId: String(userId),
      type: 'REQUESTER_NEEDS_CORRECTION',
      title: 'Please review your account details',
      message: note || 'GSO Staff has requested corrections to your information. Please update and resubmit.',
      href: '/requester/profile',
      dedupeKey: `requester-needs-correction:${userId}`,
    });
  }

  return profile;
}

module.exports = { getMine, submitMine, listReviews, getReviewPicture, review };
