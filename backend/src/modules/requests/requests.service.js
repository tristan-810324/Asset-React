const requestsRepository = require('./requests.repository');
const requesterIdentityRepository = require('../requester-identity/requester-identity.repository');
const { invalid, text, validateCreateRequest, validateRequestFilters, validateRequestId } = require('./requests.validation');

const transitions = {
  BORROWING: {
    Submitted: ['Under Review', 'Needs Information', 'Approved', 'Rejected'],
    'Under Review': ['Needs Information', 'Approved', 'Rejected'],
    'Needs Information': ['Under Review', 'Approved', 'Rejected'],
    Approved: ['Ready for Pickup'],
    'Ready for Pickup': ['Issued'],
    'Return Requested': ['Returned', 'For Repair'],
    'For Repair': ['Returned'],
    Returned: ['Closed'],
  },
  FACILITY_USE: {
    Submitted: ['Under Review', 'Needs Information', 'Approved', 'Rejected'],
    'Under Review': ['Needs Information', 'Approved', 'Rejected'],
    'Needs Information': ['Under Review', 'Approved', 'Rejected'],
    Approved: ['Completed', 'Closed'],
    Completed: ['Closed'],
  },
  JOB_REQUEST: {
    Submitted: ['Under Review', 'Needs Information', 'Approved', 'Rejected'],
    'Under Review': ['Needs Information', 'Approved', 'Rejected'],
    'Needs Information': ['Under Review', 'Approved', 'Rejected'],
    Approved: ['In Progress'],
    'In Progress': ['Completed'],
    Completed: ['Closed'],
  },
  PURCHASE_REQUISITION: {
    Submitted: ['Under Review', 'Needs Information', 'Approved', 'Rejected'],
    'Under Review': ['Needs Information', 'Approved', 'Rejected'],
    'Needs Information': ['Under Review', 'Approved', 'Rejected'],
    Approved: ['Completed', 'Closed'],
    Completed: ['Closed'],
  },
  LOSS_DAMAGE_REPORT: {
    Submitted: ['Under Review', 'Needs Information', 'Approved', 'Rejected'],
    'Under Review': ['Needs Information', 'Approved', 'Rejected'],
    'Needs Information': ['Under Review', 'Approved', 'Rejected'],
    Approved: ['In Progress', 'Completed', 'Closed'],
    'In Progress': ['Completed'],
    Completed: ['Closed'],
  },
};

const conditions = new Set(['New', 'Good', 'Fair', 'Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired']);

async function listAssets() {
  return requestsRepository.listAssets();
}

async function createRequest(input, user) {
  if (!(await requesterIdentityRepository.isVerified(user.id))) {
    invalid('Kumpletuhin ang requester identity profile at hintayin ang pag-verify ng GSO bago magsumite ng request.', 403);
  }
  const validated = validateCreateRequest(input);
  return requestsRepository.createRequest({ ...validated, userId: user.id });
}

async function listMine(user) {
  return requestsRepository.listMine(user.id);
}

async function getMine(idValue, user) {
  const request = await requestsRepository.getMineById(validateRequestId(idValue), user.id);
  if (!request) invalid('Hindi makita ang request.', 404);
  return request;
}

async function cancelMine(idValue, user) {
  const id = validateRequestId(idValue);
  const current = await requestsRepository.getMineById(id, user.id);
  if (!current) invalid('Hindi makita ang request.', 404);
  if (!['Submitted', 'Needs Information'].includes(current.status)) {
    invalid('Hindi na maaaring kanselahin ang request sa kasalukuyang status.', 409);
  }
  return requestsRepository.changeMineStatus({
    id,
    userId: user.id,
    expectedStatus: current.status,
    status: 'Cancelled',
    note: 'Request cancelled by requester.',
  });
}

async function respondMine(idValue, input, user) {
  const id = validateRequestId(idValue);
  const current = await requestsRepository.getMineById(id, user.id);
  if (!current) invalid('Hindi makita ang request.', 404);
  if (current.status !== 'Needs Information') invalid('Maaaring magbigay ng dagdag na impormasyon kapag Needs Information ang status.', 409);
  const message = text(input?.message, 'response', 2000);
  return requestsRepository.respondToRequest({ id, userId: user.id, message });
}

async function requestReturn(idValue, user) {
  const id = validateRequestId(idValue);
  const current = await requestsRepository.getMineById(id, user.id);
  if (!current) invalid('Hindi makita ang request.', 404);
  if (current.requestType !== 'BORROWING' || current.status !== 'Issued') {
    invalid('Return request ay para lamang sa kasalukuyang issued na borrowing.', 409);
  }
  return requestsRepository.changeMineStatus({
    id,
    userId: user.id,
    expectedStatus: 'Issued',
    status: 'Return Requested',
    note: 'Requester asked GSO to confirm the physical return.',
  });
}

async function listAll(query) {
  return requestsRepository.listAll(validateRequestFilters(query));
}

async function getForGso(idValue) {
  const request = await requestsRepository.getById(null, validateRequestId(idValue));
  if (!request) invalid('Hindi makita ang request.', 404);
  return request;
}

async function updateStatus(idValue, input, user) {
  const id = validateRequestId(idValue);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Hindi valid ang status update.');
  const status = text(input.status, 'status', 40);
  const note = text(input.note, 'review note', 2000, { optional: true });
  const current = await requestsRepository.getById(null, id);
  if (!current) invalid('Hindi makita ang request.', 404);
  const allowed = transitions[current.requestType]?.[current.status] || [];
  if (!allowed.includes(status)) invalid(`Hindi pinapayagan ang pagbabago mula ${current.status} papuntang ${status}.`, 409);
  if (['Rejected', 'Needs Information'].includes(status) && !note) invalid('Maglagay ng dahilan o impormasyong kailangan sa requestor.');

  let dueDate;
  if (status === 'Issued') {
    dueDate = text(input.dueDate || current.formData.returnDate, 'due date', 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) invalid('Hindi valid ang due date.');
    const [year, month, day] = dueDate.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) invalid('Hindi valid ang due date.');
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (dueDate < todayIso) invalid('Pumili ng due date na ngayon o sa hinaharap.');
  }
  const conditionOut = input.conditionOut || 'Good';
  const conditionIn = input.conditionIn || (status === 'For Repair' ? 'Needs Repair' : 'Good');
  if (!conditions.has(conditionOut) || !conditions.has(conditionIn)) invalid('Pumili ng valid na item condition.');

  return requestsRepository.setStatus({
    id,
    expectedStatus: current.status,
    status,
    note,
    changedBy: user.id,
    dueDate,
    conditionOut,
    conditionIn,
  });
}

module.exports = { listAssets, createRequest, listMine, getMine, cancelMine, respondMine, requestReturn, listAll, getForGso, updateStatus };
