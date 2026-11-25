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

// Stored codes for how a job was resolved. The reports count these codes, so the labels only change on screen.
const RESOLUTION_LABELS = Object.freeze({
  FIXED: 'Fixed',
  REPLACED: 'Replaced',
  NOT_FIXED: 'Not fixed',
  REFERRED: 'Referred to another office',
});

const MAX_PHOTOS = 3;
// Images are resized on the screen before upload. The limit keeps three photos within the 2 MB request body limit.
const MAX_PHOTO_CHARS = 600000;
const PHOTO_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

function validatePhotos(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_PHOTOS) invalid(`Attach up to ${MAX_PHOTOS} photos at a time.`);
  return value.map((photo) => {
    if (typeof photo !== 'string' || photo.length > MAX_PHOTO_CHARS || !PHOTO_PATTERN.test(photo)) {
      invalid('Each photo must be a JPG, PNG, or WebP image that is not too large.');
    }
    return photo;
  });
}

function validateProgress(input) {
  return { note: text(input?.note, 'Progress note', 2000), photos: validatePhotos(input?.photos) };
}

function validateRequesterInfo(input) {
  return { message: text(input?.message, 'Additional information', 2000), photos: validatePhotos(input?.photos) };
}

function validateComplete(input) {
  const completionNote = text(input?.completionNote, 'Completion note', 2000);
  // Optional: the screen no longer asks for it. When sent, it must be one of the known codes.
  const resolutionType = String(input?.resolutionType || '');
  if (resolutionType && !Object.hasOwn(RESOLUTION_LABELS, resolutionType)) invalid('Choose a valid resolution.');
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
  return { completionNote, resolutionType, incompleteReason, taskUpdates, photos: validatePhotos(input?.photos) };
}

function validateReopen(input) {
  return { message: text(input?.message, 'Issue details', 2000) };
}

function validateReject(input) {
  return { reason: text(input?.reason, 'Rejection reason', 2000) };
}

// Starting work names the person in charge, typed as a name.
function validateStart(input) {
  return { note: validateNote(input, 'Start note'), inChargeName: text(input?.inChargeName, 'Name of the person in charge', 200) };
}

function validateTeam(query = {}) {
  return normalizeTeam(query.team);
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
  validateProgress,
  validateRequesterInfo,
  validatePhotos,
  validateReopen,
  validateReject,
  validateStart,
  validateTeam,
  RESOLUTION_LABELS,
};
