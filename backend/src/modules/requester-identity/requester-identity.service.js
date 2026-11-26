const repository = require('./requester-identity.repository');
const notificationsRepository = require('../notifications/notifications.repository');
const auditRepository = require('../audit/audit.repository');

function invalid(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function requiredText(value, label, maximum) {
  if (typeof value !== 'string' || !value.trim()) invalid(`${label} is required.`);
  const normalized = value.trim();
  if (normalized.length > maximum) invalid(`${label} must be ${maximum} characters or less.`);
  return normalized;
}

function optionalText(value, label, maximum) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') invalid(`Invalid ${label}.`);
  const normalized = value.trim();
  if (normalized.length > maximum) invalid(`${label} must be ${maximum} characters or less.`);
  return normalized;
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

function validateRequesterIdentity(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Invalid requester identity details.');
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
    invalid('Enter a valid contact number.');
  }
  return { employeeCode, firstName, middleName, lastName, suffix, department, position, contactNumber, pictureData };
}

function validateUserId(value) {
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value) || value === '0') invalid('Invalid requester account ID.');
  return value;
}

async function getMine(user) {
  return repository.getMine(user.id);
}

async function submitMine(input, user) {
  const identity = validateRequesterIdentity(input);
  const current = await repository.getMine(user.id);
  if (!current) invalid('Requester account not found.', 404);
  if (current.status === 'Pending') invalid('Your identity details are with GSO for review. Wait for the result.', 409);
  const profile = await repository.submitMine(user.id, identity);

  // Notify IT Admin, who verifies requester accounts from User management
  await notificationsRepository.createRoleNotification({
    roleKey: 'IT_ADMIN',
    type: 'REQUESTER_VERIFICATION_PENDING',
    title: 'New requester account to verify',
    message: `${user.name || 'A requester'} submitted their identity details for verification.`,
    href: '/admin/requester-verification',
    dedupeKey: `requester-verification-pending:${user.id}`,
  });

  return profile;
}

async function listReviews(statusValue) {
  const status = typeof statusValue === 'string' ? statusValue.trim() : 'all';
  if (!['all', 'Pending', 'Verified', 'Needs Correction', 'Rejected'].includes(status)) invalid('Invalid verification status filter.');
  return repository.listReviews(status);
}

async function getReviewPicture(userIdValue) {
  return repository.getPicture(validateUserId(userIdValue));
}

async function review(userIdValue, input, reviewer) {
  const userId = validateUserId(userIdValue);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Invalid verification decision.');
  const status = input.status;
  if (!['Verified', 'Needs Correction', 'Rejected'].includes(status)) invalid('Choose a valid verification decision.');
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > 1000) invalid('The review note must be 1000 characters or less.');
  if (status !== 'Verified' && !note) invalid('Enter a note so the requester knows why.');
  const department = input.department === undefined ? undefined : requiredText(input.department, 'Department / office', 120);
  const position = input.position === undefined ? undefined : requiredText(input.position, 'Position', 120);
  const addDepartment = input.addDepartment === undefined ? false : input.addDepartment;
  const addPosition = input.addPosition === undefined ? false : input.addPosition;
  if (typeof addDepartment !== 'boolean' || typeof addPosition !== 'boolean') invalid('Invalid master data decision.');
  if (addDepartment && !department) invalid('Choose or enter a department / office before you approve.');
  if (addPosition && !position) invalid('Choose or enter a position before you approve.');
  const current = await repository.listReviewByUserId(userId);
  if (!current) invalid('The requester identity to review was not found.', 404);
  if (status === 'Verified' && current.matchedEmployeeCode && !current.employeeRecordMatch && !note) {
    invalid('Enter a review note if the profile is verified by hand and does not exactly match Employee Master Data.');
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
  if (!profile) invalid('The requester identity to review was not found.', 404);

  // Shown in History > Employees (user's request, 2026-11-20). The flag in newValues tells it apart from other employee logs.
  await auditRepository.writeLog(null, {
    entityType: 'employee',
    entityKey: String(userId),
    entityName: profile.accountName || String(userId),
    action: status === 'Verified' ? 'approved' : 'rejected',
    reason: status === 'Verified'
      ? 'Requester account verified by GSO.'
      : status === 'Rejected'
        ? `Requester account rejected by GSO. Note: ${note}`
        : `Requester account sent back for correction. Note: ${note}`,
    newValues: { requesterVerification: true, status, note: note || null, reviewerName: reviewer.name || null, reviewerEmail: reviewer.email || null },
    changedByUserId: reviewer.id,
  });

  // Resolve the pending verification notification since the review is complete
  await notificationsRepository.resolveByPrefix(`requester-verification-pending:${userId}`);

  // Notify the requester of the result. The wording names whoever decided: IT Admin or GSO Staff.
  const reviewerLabel = reviewer?.roles?.includes('IT_ADMIN') ? 'IT Admin' : 'GSO Staff';
  if (status === 'Verified') {
    await notificationsRepository.createUserNotification({
      userId: String(userId),
      type: 'REQUESTER_VERIFIED',
      title: 'Your account has been verified!',
      message: `Your identity has been approved by ${reviewerLabel}. You can now submit service requests.`,
      href: '/requester/request-center',
      dedupeKey: `requester-verified:${userId}`,
    });
  } else if (status === 'Needs Correction') {
    await notificationsRepository.createUserNotification({
      userId: String(userId),
      type: 'REQUESTER_NEEDS_CORRECTION',
      title: 'Please review your account details',
      message: note || `${reviewerLabel} has requested corrections to your information. Please update and resubmit.`,
      href: '/requester/profile',
      dedupeKey: `requester-needs-correction:${userId}`,
    });
  } else if (status === 'Rejected') {
    await notificationsRepository.createUserNotification({
      userId: String(userId),
      type: 'REQUESTER_REJECTED',
      title: 'Your account was not approved',
      message: note,
      href: '/requester/profile',
      dedupeKey: `requester-rejected:${userId}:${Date.now()}`,
    });
  }

  return profile;
}

module.exports = { getMine, submitMine, listReviews, getReviewPicture, review, validateRequesterIdentity };
