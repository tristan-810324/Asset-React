const { SERVICE_TEAMS } = require('./service-work-order.constants');

function invalid(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function requestId(value) {
  const normalized = String(value ?? '');
  if (!/^\d{1,20}$/.test(normalized)) invalid('A valid service request ID is required.');
  return normalized;
}

function text(value, label, max = 2000, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim()) invalid(`${label} is required.`);
  const normalized = value.trim();
  if (normalized.length > max) invalid(`${label} cannot exceed ${max} characters.`);
  return normalized;
}

function normalizeTeam(value, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  const team = String(value || '').trim().toUpperCase();
  if (!SERVICE_TEAMS.has(team)) invalid('Choose GSO or ITSS.');
  return team;
}

const QUEUE_ALIASES = Object.freeze({
  '': 'ALL',
  ALL: 'ALL',
  NEW: 'NEW',
  REVIEW: 'UNDER_REVIEW',
  UNDER_REVIEW: 'UNDER_REVIEW',
  ACTIVE: 'MY_ACTIVE',
  MY_ACTIVE: 'MY_ACTIVE',
  DUE_TODAY: 'DUE_TODAY',
  OVERDUE: 'OVERDUE',
  AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
  AWAITING_REQUESTER_CONFIRMATION: 'AWAITING_CONFIRMATION',
  CLOSED: 'CLOSED',
});

function normalizeQueue(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  const queue = QUEUE_ALIASES[normalized];
  if (!queue) invalid('Choose a valid service workboard queue.');
  return queue;
}

function positiveInteger(value, fallback, max = 250) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) invalid('Pagination values must be whole numbers.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > max) invalid('Pagination value is out of range.');
  return number;
}

function validateList(query = {}) {
  const limit = positiveInteger(query.limit, 50, 100);
  const offset = positiveInteger(query.offset, 0, 100000);
  const search = query.search === undefined || query.search === null || query.search === ''
    ? ''
    : text(String(query.search), 'Search', 100);
  return {
    team: normalizeTeam(query.team),
    queue: normalizeQueue(query.queue),
    limit,
    offset,
    search,
  };
}

function validateNote(input, field = 'Note', max = 2000, { required = false } = {}) {
  return text(input?.note, field, max, { optional: !required });
}

function validateNeedInfo(input) {
  return { message: text(input?.message, 'Message', 2000) };
}

function validateForward(input) {
  return {
    team: normalizeTeam(input?.team),
    note: text(input?.note, 'Forwarding note', 1000, { optional: true }),
  };
}

function validateComplete(input) {
  const completionNote = text(input?.completionNote, 'Completion note', 2000);
  const incompleteReason = text(input?.incompleteReason, 'Incomplete task reason', 2000, { optional: true });
  const rawUpdates = input?.taskUpdates === undefined ? [] : input.taskUpdates;
  if (!Array.isArray(rawUpdates) || rawUpdates.length > 100) invalid('Task updates must be a list of up to 100 items.');
  const seen = new Set();
  const taskUpdates = rawUpdates.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) invalid('Each task update must be valid.');
    const id = String(entry.id ?? '');
    if (!/^\d{1,20}$/.test(id) || seen.has(id)) invalid('Each task can only be updated once.');
    if (typeof entry.completed !== 'boolean') invalid('Each task update needs a completed value.');
    seen.add(id);
    return { id, completed: entry.completed };
  });
  return { completionNote, incompleteReason, taskUpdates };
}

function validateReopen(input) {
  return { message: text(input?.message, 'Issue details', 2000) };
}

function validateReject(input) {
  return { reason: text(input?.reason, 'Rejection reason', 2000) };
}

module.exports = {
  invalid,
  requestId,
  text,
  normalizeTeam,
  validateList,
  validateNote,
  validateNeedInfo,
  validateForward,
  validateComplete,
  validateReopen,
  validateReject,
};
