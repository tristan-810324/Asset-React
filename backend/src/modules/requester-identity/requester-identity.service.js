const repository = require('./requester-identity.repository');

function invalid(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function requiredText(value, label, maximum) {
  if (typeof value !== 'string' || !value.trim()) invalid(`${label} ay kailangan.`);
  const normalized = value.trim();
  if (normalized.length > maximum) invalid(`${label} ay hindi dapat lumampas sa ${maximum} characters.`);
  return normalized;
}

function validateRequesterIdentity(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Hindi valid ang requester identity details.');
  const employeeCode = requiredText(input.employeeCode, 'Employee number', 50);
  const department = requiredText(input.department, 'Department / office', 120);
  const position = requiredText(input.position, 'Position', 120);
  const contactNumber = requiredText(input.contactNumber, 'Contact number', 30);
  const digits = contactNumber.replace(/\D/g, '');
  if (!/^[0-9+().\-\s]{7,30}$/.test(contactNumber) || digits.length < 7 || digits.length > 20) {
    invalid('Maglagay ng valid na contact number.');
  }
  return { employeeCode, department, position, contactNumber };
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
  return repository.submitMine(user.id, identity);
}

async function listReviews(statusValue) {
  const status = typeof statusValue === 'string' ? statusValue.trim() : 'all';
  if (!['all', 'Pending', 'Verified', 'Needs Correction'].includes(status)) invalid('Hindi valid ang verification status filter.');
  return repository.listReviews(status);
}

async function review(userIdValue, input, reviewer) {
  const userId = validateUserId(userIdValue);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Hindi valid ang verification decision.');
  const status = input.status;
  if (!['Verified', 'Needs Correction'].includes(status)) invalid('Pumili ng valid na verification decision.');
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > 1000) invalid('Ang review note ay hindi dapat lumampas sa 1000 characters.');
  if (status === 'Needs Correction' && !note) invalid('Maglagay ng note para malaman ng requester kung ano ang dapat ayusin.');
  const current = await repository.listReviewByUserId(userId);
  if (!current) invalid('Hindi makita ang requester identity na rerepasuhin.', 404);
  if (status === 'Verified' && !current.employeeRecordMatch && !note) {
    invalid('Maglagay ng review note kung mano-manong ive-verify ang profile na hindi eksaktong tumugma sa Employee Master Data.');
  }
  const profile = await repository.review(userId, { status, note, reviewedByUserId: reviewer.id });
  if (!profile) invalid('Hindi makita ang requester identity na rerepasuhin.', 404);
  return profile;
}

module.exports = { getMine, submitMine, listReviews, review };
