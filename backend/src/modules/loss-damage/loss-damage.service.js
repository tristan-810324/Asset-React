// Loss & Damage Cases: GSO Staff review each report and record one operational resolution.
//   No charge  -> custody is resolved and the case closes immediately.
//   For repair -> the case stays In Progress until GSO confirms the follow-up and closes it.
// The case decision and custody hand-off are saved by the backend; no browser action is trusted to do it.
const requestsRepository = require('../requests/requests.repository');
const notificationsRepository = require('../notifications/notifications.repository');
const auditRepository = require('../audit/audit.repository');
const { validateRequestId } = require('../requests/requests.validation');
const repository = require('./loss-damage.repository');

const RESOLUTION_LABELS = { NO_CHARGE: 'No charge', FOR_REPAIR: 'For repair' };
const GSO_PAGE = '/gso/loss-damage-cases';

const fail = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });

function requiredText(value, label, max) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) throw fail(`Enter the ${label}.`);
  if (trimmed.length > max) throw fail(`The ${label} can have up to ${max} characters.`);
  return trimmed;
}

function optionalText(value, label, max) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw fail(`The ${label} is not valid.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw fail(`The ${label} can have up to ${max} characters.`);
  return trimmed;
}

// Notices and audit entries run after the change is saved, so a failure is logged instead of undoing the change.
async function sideEffect(label, work) {
  try {
    await work();
  } catch (error) {
    console.error(`${label} could not be saved.`, { code: error.code, message: error.message });
  }
}

function notifyRequester(request, event, title, message) {
  if (!request?.requesterId) return Promise.resolve();
  return sideEffect('Loss & Damage requester notice', () => notificationsRepository.createUserNotification({
    userId: request.requesterId,
    type: 'REQUEST',
    title,
    message: `${request.referenceNo}: ${message}`,
    href: `/requester/requests/${request.id}`,
    dedupeKey: `loss-damage:${request.id}:${event}:${Date.now()}`,
  }));
}

function notifyStaff(request, event, title, message) {
  return sideEffect('Loss & Damage GSO notice', () => notificationsRepository.createRoleNotification({
    roleKey: 'GSO_STAFF',
    type: 'REQUEST',
    title,
    message: `${request.referenceNo}: ${message}`,
    href: `${GSO_PAGE}?case=${encodeURIComponent(request.id)}`,
    dedupeKey: `loss-damage-staff:${request.id}:${event}`,
  }));
}

function notifyHead(request, event, title, message) {
  return sideEffect('Loss & Damage GSO Head notice', () => notificationsRepository.createRoleNotification({
    roleKey: 'GSO_HEAD',
    type: 'REQUEST',
    title,
    message: `${request.referenceNo}: ${message}`,
    href: '/gso-head/items',
    dedupeKey: `loss-damage-head:${request.id}:${event}`,
  }));
}

function resolveNotices(...prefixes) {
  return sideEffect('Notification cleanup', () => Promise.all(prefixes.map((prefix) => notificationsRepository.resolveByPrefix(prefix))));
}

function audit(request, userId, reason, values = {}) {
  return sideEffect('Loss & Damage audit entry', () => auditRepository.writeLog(null, {
    entityType: 'request',
    entityKey: request.referenceNo,
    entityName: request.title || 'Loss / damage report',
    requestId: request.id,
    action: 'updated',
    reason,
    newValues: { status: request.status, ...values },
    changedByUserId: userId,
  }));
}

async function loadCase(id) {
  const request = await requestsRepository.getById(null, id);
  if (!request || request.requestType !== 'LOSS_DAMAGE_REPORT') throw fail('Loss / damage case not found.', 404);
  return { ...request, settlement: await repository.getSettlement(null, id) };
}

async function caseResult(id) {
  return { case: await loadCase(id) };
}

async function listCases() {
  const requests = await requestsRepository.listAll({ requestType: 'LOSS_DAMAGE_REPORT', status: '', search: '' });
  const settlements = await repository.listSettlements(requests.map((request) => String(request.id)));
  return { cases: requests.map((request) => ({ ...request, settlement: settlements.get(String(request.id)) || null })) };
}

async function getCase(idValue) {
  return caseResult(validateRequestId(idValue));
}

async function startReview(idValue, user) {
  const id = validateRequestId(idValue);
  const request = await repository.startReview({ id, userId: user.id });
  await resolveNotices(`staff-new:${id}:`, `staff-reply:${id}:`);
  await notifyRequester(request, 'review', 'GSO is reviewing your report', 'GSO Staff started reviewing your loss / damage report.');
  await audit(request, user.id, 'GSO Staff started reviewing the loss / damage report.');
  return caseResult(id);
}

async function decide(idValue, input, user) {
  const id = validateRequestId(idValue);
  const resolution = typeof input?.resolution === 'string' ? input.resolution : '';
  if (!RESOLUTION_LABELS[resolution]) throw fail('Choose No charge or For repair.');
  const reason = requiredText(input.reason, 'reason for the decision', 1000);
  const summary = RESOLUTION_LABELS[resolution];

  const { request, changed, inventory } = await repository.saveDecision({
    id,
    userId: user.id,
    resolution,
    reason,
    summary,
    resolvedUnits: input?.resolvedUnits,
  });
  await resolveNotices(`staff-new:${id}:`, `staff-reply:${id}:`);
  await audit(request, user.id, `${changed ? 'Decision changed' : 'Decision'}: ${summary}. Reason: ${reason}`, {
    resolution,
    custodyResolved: inventory?.resolved === true,
  });

  if (resolution === 'NO_CHARGE') {
    const custodyMessage = inventory?.summary ? ` ${inventory.summary}` : '';
    await notifyRequester(request, 'decision', 'No charge for your report', `GSO decided there is no charge and closed the case. Reason: ${reason}${custodyMessage}`);
    await notifyStaff(request, 'closed', 'Loss / damage case closed', `No charge was recorded and the case was closed.${custodyMessage}`);
    await notifyHead(request, 'closed', 'Loss / damage case closed', `GSO recorded no charge and closed ${request.referenceNo}.${custodyMessage}`);
  } else {
    await notifyRequester(request, 'decision', 'GSO will repair the item', `No charge is needed. GSO will complete the physical follow-up before closing the case. Reason: ${reason}`);
  }
  return caseResult(id);
}

async function closeCase(idValue, input, user) {
  const id = validateRequestId(idValue);
  if (input?.handled !== true) throw fail('Confirm that the physical follow-up is done before you close the case.');
  const note = optionalText(input.note, 'closing note', 1000);
  const { request, inventory } = await repository.closeCase({
    id,
    userId: user.id,
    note: note ? `Case closed. Note: ${note}` : 'Case closed.',
  });
  await resolveNotices(`loss-damage-staff:${id}:`);
  const custodyMessage = inventory?.summary ? ` ${inventory.summary}` : '';
  await notifyRequester(request, 'closed', 'Case closed', `GSO completed the follow-up and closed the case.${note ? ` Note from GSO: ${note}` : ''}${custodyMessage}`);
  await notifyStaff(request, 'closed', 'Loss / damage case closed', `GSO completed the follow-up and closed the case.${custodyMessage}`);
  await notifyHead(request, 'closed', 'Loss / damage case closed', `GSO completed the follow-up for ${request.referenceNo}.${custodyMessage}`);
  await audit(request, user.id, note ? `Loss / damage case closed. Note: ${note}` : 'Loss / damage case closed.', {
    custodyResolved: inventory?.resolved === true,
  });
  return caseResult(id);
}

async function getMine(idValue, user) {
  const id = validateRequestId(idValue);
  const request = await requestsRepository.getMineById(id, user.id);
  if (!request || request.requestType !== 'LOSS_DAMAGE_REPORT') throw fail('Request not found.', 404);
  const settlement = await repository.getSettlement(null, id);
  return {
    requestStatus: request.status,
    settlement: settlement ? {
      resolution: settlement.resolution,
      reason: settlement.reason,
      status: settlement.status,
      decidedAt: settlement.assessedAt,
      assessedBy: settlement.assessedBy,
      custodyResolvedAt: settlement.custodyResolvedAt,
      custodyResolutionSummary: settlement.custodyResolutionSummary,
    } : null,
  };
}

module.exports = {
  listCases,
  getCase,
  startReview,
  decide,
  closeCase,
  getMine,
};
