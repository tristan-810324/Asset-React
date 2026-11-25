const nodemailer = require('nodemailer');
const env = require('../../config/env');
const repository = require('./service-work-orders.repository');
const notificationsRepository = require('../notifications/notifications.repository');
const auditRepository = require('../audit/audit.repository');
const {
  TEAM_ROLES,
  SERVICE_CATEGORY_META,
  TERMINAL_SERVICE_STATUSES,
  priorityForService,
} = require('./service-work-order.constants');
const {
  invalid,
  requestId,
  validateList,
  validateNote,
  validateNeedInfo,
  validateForward,
  validateComplete,
  validateProgress,
  validateRequesterInfo,
  validateReopen,
  validateReject,
  validateStart,
  validateTeam,
  RESOLUTION_LABELS,
} = require('./service-work-orders.validation');

// History notes that start with this prefix are the transfer history shown on the job.
const TRANSFER_NOTE = 'Forwarded from ';

const mailTransport = env.smtp
  ? nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
  })
  : null;

function teamPath(team) {
  return team === 'ITSS' ? '/itss/service-workboard' : '/gso/service-workboard';
}

function teamName(team) {
  return team === 'ITSS' ? 'ITSS Support' : 'GSO Facilities';
}
function toManilaDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function manilaToday() {
  return new Date(`${toManilaDate()}T00:00:00Z`);
}

function deadlineLabel(targetDate, status) {
  if (!targetDate || TERMINAL_SERVICE_STATUSES.has(status)) return '';
  const target = new Date(`${targetDate}T00:00:00Z`);
  const today = manilaToday();
  const days = Math.round((target - today) / 86400000);
  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `${days} days remaining`;
}

// Open jobs get their priority from the target date at read time; closed jobs keep the value they had.
function currentPriority(workOrder) {
  if (TERMINAL_SERVICE_STATUSES.has(workOrder.status)) return workOrder.priority;
  return priorityForService({ category: workOrder.serviceCategory, targetDate: workOrder.targetDate, today: manilaToday() });
}

// Stored values are URGENT / HIGH / STANDARD; screens show Urgent / High / Standard.
function displayPriority(value) {
  const text = String(value || 'STANDARD');
  return `${text.charAt(0)}${text.slice(1).toLowerCase()}`;
}

function presentWorkOrder(workOrder) {
  if (!workOrder) return null;
  const priority = displayPriority(currentPriority(workOrder));
  const workflow = {
    routeTeam: workOrder.routeTeam,
    serviceCategory: workOrder.serviceCategory,
    priority,
    targetDate: workOrder.targetDate,
    deadlineLabel: deadlineLabel(workOrder.targetDate, workOrder.status),
    assignedStaffName: workOrder.assignedStaffName || null,
    assignedStaffId: workOrder.assignedStaffId || null,
    claimedAt: workOrder.claimedAt || null,
    reviewedAt: workOrder.reviewedAt || null,
    startedAt: workOrder.startedAt || null,
    completedAt: workOrder.workCompletedAt || null,
    awaitingConfirmationAt: workOrder.awaitingConfirmationAt || null,
    autoCloseAt: workOrder.autoCloseAt || null,
    requesterConfirmedAt: workOrder.requesterConfirmedAt || null,
    closureType: workOrder.closureType || null,
    resolutionType: workOrder.resolutionType || null,
    completionNote: workOrder.completionNote || '',
    incompleteReason: workOrder.incompleteReason || '',
    reopenCount: Number(workOrder.reopenCount || 0),
    tasks: workOrder.tasks || [],
    history: workOrder.history || [],
  };
  return {
    ...workOrder,
    priority,
    deadlineLabel: workflow.deadlineLabel,
    checklist: workOrder.tasks || [],
    transfers: (workOrder.history || []).filter((entry) => String(entry.note || '').startsWith(TRANSFER_NOTE)),
    serviceWorkflow: workflow,
    requester: {
      id: workOrder.requesterId,
      name: workOrder.requesterName,
      email: workOrder.requesterEmail,
      // The department the requester typed on this job request, not the profile's department.
      department: workOrder.formData?.departmentOrganization || null,
    },
  };
}

function hasTeamRole(user, team) {
  return Boolean(user?.roles?.some((role) => TEAM_ROLES[team].includes(role)));
}

function assertTeamAccess(user, team) {
  if (!hasTeamRole(user, team)) invalid(`You do not have access to the ${team} service queue.`, 403);
}

function assertCurrentTeamAccess(user, current) {
  assertTeamAccess(user, current.routeTeam);
}

// Every change to an open job goes through the claimed staff member, so two people never work the same job.
function assertAssignedTo(user, current) {
  if (!current.assignedStaffId || String(current.assignedStaffId) !== String(user.id)) {
    invalid('Claim this job first. Only the staff member who claimed it can change it.', 403);
  }
}
function assertNonTerminal(current) {
  if (TERMINAL_SERVICE_STATUSES.has(current.status)) invalid('This service request is already closed.', 409);
}

async function sideEffect(label, callback) {
  try {
    await callback();
  } catch (error) {
    console.error(`${label} could not be saved.`, { code: error.code, message: error.message });
  }
}

async function notifyRequester(workOrder, title, message, key) {
  if (!workOrder?.requesterId) return;
  await sideEffect('Requester service notification', () => notificationsRepository.createUserNotification({
    userId: workOrder.requesterId,
    type: 'SERVICE_WORK_ORDER',
    title,
    message: `${workOrder.referenceNo}: ${message}`,
    href: `/requester/requests/${workOrder.id}`,
    dedupeKey: key,
  }));
}

// Email is optional: without SMTP settings it is skipped, and a failure is logged without undoing the change.
async function emailRequester(workOrder, subject, message) {
  if (!mailTransport || !workOrder?.requesterEmail) return;
  await sideEffect('Requester service email', () => mailTransport.sendMail({
    from: env.smtp.from,
    to: workOrder.requesterEmail,
    subject: `${subject}: ${workOrder.referenceNo}`,
    text: [
      `Hello ${workOrder.requesterName || ''},`,
      '',
      message,
      '',
      `Reference: ${workOrder.referenceNo}`,
      '',
      'This is an automated message from A.S.SET.',
    ].join('\n'),
  }));
}

async function notifyTeam(workOrder, title, message, key, { assignedOnly = false } = {}) {
  if (!workOrder) return;
  if (assignedOnly && workOrder.assignedStaffId) {
    await sideEffect('Assigned staff service notification', () => notificationsRepository.createUserNotification({
      userId: workOrder.assignedStaffId,
      type: 'SERVICE_WORK_ORDER',
      title,
      message: `${workOrder.referenceNo}: ${message}`,
      href: `${teamPath(workOrder.routeTeam)}?request=${encodeURIComponent(workOrder.id)}`,
      dedupeKey: `${key}:staff:${workOrder.assignedStaffId}`,
    }));
    return;
  }
  for (const roleKey of TEAM_ROLES[workOrder.routeTeam]) {
    await sideEffect('Service team notification', () => notificationsRepository.createRoleNotification({
      roleKey,
      type: 'SERVICE_WORK_ORDER',
      title,
      message: `${workOrder.referenceNo}: ${message}`,
      href: `${teamPath(workOrder.routeTeam)}?request=${encodeURIComponent(workOrder.id)}`,
      dedupeKey: key,
    }));
  }
}

async function writeAudit(workOrder, user, { action = 'updated', reason, oldValues = {}, newValues = {} }) {
  if (!workOrder) return;
  await sideEffect('Service work order audit entry', () => auditRepository.writeLog(null, {
    entityType: 'request',
    entityKey: workOrder.referenceNo,
    entityName: workOrder.title || 'Job / service request',
    requestId: workOrder.id,
    action,
    reason,
    oldValues,
    newValues: { status: workOrder.status, routeTeam: workOrder.routeTeam, ...newValues },
    changedByUserId: user?.id || null,
  }));
}

function statusNote(label, note) {
  return note ? `${label} ${note}` : label;
}

async function listWorkOrders(query, user) {
  const filters = validateList(query);
  assertTeamAccess(user, filters.team);
  const result = await repository.listWorkOrders({ ...filters, userId: user.id });
  return { ...result, workOrders: result.workOrders.map(presentWorkOrder) };
}

async function getWorkOrder(idValue, user) {
  const id = requestId(idValue);
  const workOrder = await repository.getWorkOrder(null, id, { withPhotos: true });
  if (!workOrder) invalid('Service work order not found.', 404);
  assertCurrentTeamAccess(user, workOrder);
  return presentWorkOrder(workOrder);
}

// The staff members who can be put in charge of a job in this team's queue.
async function listTeamMembers(query, user) {
  const team = validateTeam(query);
  assertTeamAccess(user, team);
  return repository.listTeamMembers(TEAM_ROLES[team]);
}

// Claim only assigns the job. The staff member then starts the review, or starts work directly.
async function claimWorkOrder(idValue, user) {
  const id = requestId(idValue);
  const result = await repository.withLockedWorkOrder(id, async (client, current) => {
    assertCurrentTeamAccess(user, current);
    assertNonTerminal(current);
    if (current.status === 'Awaiting Requester Confirmation') invalid('Wait for requester confirmation before changing this completed request.', 409);
    if (current.assignedStaffId && String(current.assignedStaffId) !== String(user.id)) {
      invalid('This job is already claimed. Use Take over if you need to handle it.', 409);
    }
    await repository.updateWorkOrder(client, id, {
      assignedStaffId: user.id,
      claimedAt: current.claimedAt || new Date(),
    });
    await repository.insertHistory(client, {
      requestId: id,
      previousStatus: current.status,
      status: current.status,
      note: `Claimed by ${user.name}.`,
      changedByUserId: user.id,
    });
  });
  const workOrder = presentWorkOrder(result.workOrder);
  await notifyRequester(workOrder, 'Request assigned', `${user.name} is handling your request.`, `service-claimed:${id}:${workOrder.claimedAt || Date.now()}`);
  await writeAudit(workOrder, user, {
    reason: `Service work order claimed by ${user.name}.`,
    oldValues: { status: result.current.status, assignedStaffId: result.current.assignedStaffId || null },
    newValues: { assignedStaffId: user.id },
  });
  return workOrder;
}

async function reviewWorkOrder(idValue, input, user) {
  const id = requestId(idValue);
  const note = validateNote(input, 'Review note');
  const result = await repository.withLockedWorkOrder(id, async (client, current) => {
    assertCurrentTeamAccess(user, current);
    assertNonTerminal(current);
    assertAssignedTo(user, current);
    if (current.status === 'Under Review') invalid('This job is already under review.', 409);
    if (current.status !== 'Submitted') invalid('Start review only on a new or resubmitted job.', 409);
    await repository.updateRequestStatus(client, { requestId: id, status: 'Under Review' });
    await repository.updateWorkOrder(client, id, { reviewedAt: new Date() });
    await repository.insertHistory(client, {
      requestId: id,
      previousStatus: current.status,
      status: 'Under Review',
      note: statusNote('Review started.', note),
      changedByUserId: user.id,
    });
  });
  const workOrder = presentWorkOrder(result.workOrder);
  await notifyRequester(workOrder, 'Request under review', 'The assigned team is reviewing your request.', `service-review:${id}:${workOrder.reviewedAt || Date.now()}`);
  await writeAudit(workOrder, user, { reason: 'Service work order review started.', oldValues: { status: result.current.status } });
  return workOrder;
}

async function requestMoreInformation(idValue, input, user) {
  const id = requestId(idValue);
  const { message } = validateNeedInfo(input);
  const result = await repository.withLockedWorkOrder(id, async (client, current) => {
    assertCurrentTeamAccess(user, current);
    assertNonTerminal(current);
    assertAssignedTo(user, current);
    if (!['Submitted', 'Under Review'].includes(current.status)) {
      invalid('More information can only be requested before work starts.', 409);
    }
    await repository.updateRequestStatus(client, { requestId: id, status: 'Needs Information' });
    await repository.insertHistory(client, {
      requestId: id,
      previousStatus: current.status,
      status: 'Needs Information',
      note: `Information requested: ${message}`,
      changedByUserId: user.id,
    });
  });
  const workOrder = presentWorkOrder(result.workOrder);
  await notifyRequester(workOrder, 'More information needed', message, `service-needs-info:${id}:${Date.now()}`);
  await writeAudit(workOrder, user, { reason: 'Requested more information from the requester.', oldValues: { status: result.current.status } });
  return workOrder;
}

// A forwarded job becomes a new, unclaimed job in the other queue, so that team claims it like any other.
async function forwardWorkOrder(idValue, input, user) {
  const id = requestId(idValue);
  const { team, note } = validateForward(input);
  const result = await repository.withLockedWorkOrder(id, async (client, current) => {
    assertCurrentTeamAccess(user, current);
    assertNonTerminal(current);
    assertAssignedTo(user, current);
    if (current.routeTeam === team) invalid('This job is already routed to that team.', 409);
    if (!['Submitted', 'Under Review', 'Needs Information'].includes(current.status)) {
      invalid('This job cannot be forwarded once work has started.', 409);
    }
    await repository.updateWorkOrder(client, id, {
      routeTeam: team,
      assignedStaffId: null,
      claimedAt: null,
      reviewedAt: null,
      startedAt: null,
    });
    await repository.updateRequestStatus(client, { requestId: id, status: 'Submitted' });
    await repository.insertHistory(client, {
      requestId: id,
      previousStatus: current.status,
      status: 'Submitted',
      note: `${TRANSFER_NOTE}${current.routeTeam} to ${team}.${note ? ` ${note}` : ''}`,
      changedByUserId: user.id,
    });
  });
  const workOrder = presentWorkOrder(result.workOrder);
  await notifyTeam(workOrder, 'Job forwarded to your team', `A ${result.current.routeTeam} job was forwarded to your queue.`, `service-forward:${id}:${team}:${Date.now()}`);
  await notifyRequester(workOrder, 'Request routed', `Your request was routed to ${teamName(team)} for handling.`, `service-route:${id}:${team}:${Date.now()}`);
  await writeAudit(workOrder, user, {
    action: 'moved',
    reason: `Forwarded service work order from ${result.current.routeTeam} to ${team}.${note ? ` ${note}` : ''}`,
    oldValues: { routeTeam: result.current.routeTeam, status: result.current.status },
  });
  return workOrder;
}

// Starting work names the person in charge, typed as a name. The claimed staff member starts the job.
async function startWork(idValue, input, user) {
  const id = requestId(idValue);
  const { note, inChargeName } = validateStart(input);
  const result = await repository.withLockedWorkOrder(id, async (client, current) => {
    assertCurrentTeamAccess(user, current);
    assertNonTerminal(current);
    assertAssignedTo(user, current);
    if (!['Submitted', 'Under Review'].includes(current.status)) {
      invalid('Work can start only on a claimed job that is not waiting for information.', 409);
    }
    await repository.updateRequestStatus(client, { requestId: id, status: 'In Progress' });
    await repository.updateWorkOrder(client, id, { startedAt: new Date(), inChargeStaffName: inChargeName });
    await repository.insertHistory(client, {
      requestId: id,
      previousStatus: current.status,
      status: 'In Progress',
      note: statusNote(`Work started. In charge: ${inChargeName}.`, note),
      changedByUserId: user.id,
    });
  });
  const workOrder = presentWorkOrder(result.workOrder);
  await notifyRequester(workOrder, 'Work started', 'The assigned team started work on your request.', `service-started:${id}:${workOrder.startedAt || Date.now()}`);
  await writeAudit(workOrder, user, {
    reason: `Service work started. In charge: ${inChargeName}.`,
    oldValues: { status: result.current.status },
    newValues: { inChargeStaffName: inChargeName },
  });
  return workOrder;
}

// A progress note while work is in progress, with optional photos. The requester sees it in the job history right away.
async function progressWork(idValue, input, user) {
  const id = requestId(idValue);
  const { note, photos } = validateProgress(input);
  const result = await repository.withLockedWorkOrder(id, async (client, current) => {
    assertCurrentTeamAccess(user, current);
    assertNonTerminal(current);
    assertAssignedTo(user, current);
    if (current.status !== 'In Progress') invalid('Progress updates can be added only while work is in progress.', 409);
    await repository.insertPhotos(client, id, photos, { source: 'STAFF_PROGRESS', userId: user.id });
    await repository.insertHistory(client, {
      requestId: id,
      previousStatus: current.status,
      status: 'In Progress',
      note: `Progress update: ${note}`,
      changedByUserId: user.id,
    });
  });
  const workOrder = presentWorkOrder(result.workOrder);
  await notifyRequester(workOrder, 'Progress update', note, `service-progress:${id}:${Date.now()}`);
  await writeAudit(workOrder, user, { reason: `Service work progress update. ${note}`, oldValues: { status: result.current.status } });
  return workOrder;
}

async function completeWork(idValue, input, user) {
  const id = requestId(idValue);
  const { completionNote, resolutionType, incompleteReason, taskUpdates, photos } = validateComplete(input);
  const result = await repository.withLockedWorkOrder(id, async (client, current) => {
    assertCurrentTeamAccess(user, current);
    assertAssignedTo(user, current);
    if (current.status !== 'In Progress') invalid('Only work in progress can be marked complete.', 409);
    await repository.updateTasks(client, { requestId: id, taskUpdates, changedByUserId: user.id });
    const openTasks = await repository.countOpenTasks(client, id);
    if (openTasks > 0 && !incompleteReason) {
      invalid('Complete every task or provide a reason for the remaining task items.');
    }
    const now = new Date();
    await repository.updateRequestStatus(client, { requestId: id, status: 'Awaiting Requester Confirmation' });
    await repository.updateWorkOrder(client, id, {
      workCompletedAt: now,
      awaitingConfirmationAt: now,
      autoCloseAt: new Date(now.getTime() + (2 * 24 * 60 * 60 * 1000)),
      requesterRemindedAt: null,
      resolutionType: resolutionType || null,
      completionNote,
      incompleteReason,
    });
    await repository.insertPhotos(client, id, photos, { source: 'STAFF_COMPLETION', userId: user.id });
    await repository.insertHistory(client, {
      requestId: id,
      previousStatus: current.status,
      status: 'Awaiting Requester Confirmation',
      note: `Work marked complete.${resolutionType ? ` Resolution: ${RESOLUTION_LABELS[resolutionType]}.` : ''} ${completionNote}${incompleteReason ? ` Remaining-task note: ${incompleteReason}` : ''}`,
      changedByUserId: user.id,
    });
  });
  const workOrder = presentWorkOrder(result.workOrder);
  const confirmMessage = 'The assigned team marked your request complete. Confirm that the issue is resolved or report an issue within 2 days.';
  await notifyRequester(workOrder, 'Please confirm service completion', confirmMessage, `service-awaiting-confirmation:${id}:${workOrder.awaitingConfirmationAt || Date.now()}`);
  await emailRequester(workOrder, 'Please confirm your service request', confirmMessage);
  await writeAudit(workOrder, user, {
    reason: 'Service work marked complete and sent to requester for confirmation.',
    oldValues: { status: result.current.status },
    newValues: { incompleteReason: workOrder.incompleteReason || null },
  });
  return workOrder;
}

// The assigned staff member says the job is not finished yet and why. The job stays In Progress; the reason goes to the
// job history, the audit log, and the requester (user's request, 2026-11-20).
async function notFinishWork(idValue, input, user) {
  const id = requestId(idValue);
  const reason = validateNote({ note: input?.reason }, 'Reason', 2000, { required: true });
  // The expected finish date is required, must be a real calendar date, and cannot be in the past (Manila time).
  const expectedDate = String(input?.expectedDate || '');
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(expectedDate) ? new Date(`${expectedDate}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== expectedDate) invalid('Choose the expected finish date.');
  if (expectedDate < toManilaDate()) invalid('The expected finish date cannot be in the past.');
  const result = await repository.withLockedWorkOrder(id, async (client, current) => {
    assertCurrentTeamAccess(user, current);
    assertAssignedTo(user, current);
    if (current.status !== 'In Progress') invalid('Only work in progress can be marked not finished.', 409);
    await repository.insertHistory(client, {
      requestId: id,
      previousStatus: current.status,
      status: 'In Progress',
      note: `Not finished yet. Reason: ${reason}. Expected finish: ${expectedDate}.`,
      changedByUserId: user.id,
    });
    // The expected finish becomes the new target date, so Due Today and Overdue follow the real schedule.
    await repository.updateWorkOrder(client, id, { targetDate: expectedDate });
  });
  const workOrder = presentWorkOrder(result.workOrder);
  await notifyRequester(workOrder, 'Work is still in progress', `The team is still working on your request. Reason: ${reason}. Expected to finish by ${expectedDate}.`, `service-not-finished:${id}:${Date.now()}`);
  await writeAudit(workOrder, user, { reason: `Service work not finished yet. Reason: ${reason}. Expected finish: ${expectedDate}.`, oldValues: { status: result.current.status } });
  return workOrder;
}

async function takeOverWorkOrder(idValue, input, user) {
  const id = requestId(idValue);
  const note = validateNote(input, 'Takeover note', 1000, { required: true });
  const result = await repository.withLockedWorkOrder(id, async (client, current) => {
    assertCurrentTeamAccess(user, current);
    assertNonTerminal(current);
    if (current.status === 'Awaiting Requester Confirmation') invalid('A completed request cannot be taken over while it awaits requester confirmation.', 409);
    if (current.assignedStaffId && String(current.assignedStaffId) === String(user.id)) invalid('You already handle this job.', 409);
    await repository.updateWorkOrder(client, id, {
      assignedStaffId: user.id,
      claimedAt: new Date(),
    });
    await repository.insertHistory(client, {
      requestId: id,
      previousStatus: current.status,
      status: current.status,
      note: `Taken over by ${user.name}. ${note}`,
      changedByUserId: user.id,
    });
  });
  const workOrder = presentWorkOrder(result.workOrder);
  await notifyRequester(workOrder, 'Request reassigned', `${user.name} is now handling your request.`, `service-takeover:${id}:${workOrder.claimedAt || Date.now()}`);
  await writeAudit(workOrder, user, {
    action: 'moved',
    reason: `Service work order taken over by ${user.name}. ${note}`,
    oldValues: { assignedStaffId: result.current.assignedStaffId || null },
  });
  return workOrder;
}

async function rejectWorkOrder(idValue, input, user) {
  const id = requestId(idValue);
  const { reason } = validateReject(input);
  const result = await repository.withLockedWorkOrder(id, async (client, current) => {
    assertCurrentTeamAccess(user, current);
    assertNonTerminal(current);
    assertAssignedTo(user, current);
    if (!['Submitted', 'Under Review', 'Needs Information'].includes(current.status)) {
      invalid('Only a job that has not started can be rejected.', 409);
    }
    await repository.updateRequestStatus(client, { requestId: id, status: 'Rejected' });
    await repository.updateWorkOrder(client, id, {
      closedAt: new Date(),
      closedByUserId: user.id,
      closureType: 'REJECTED',
      autoCloseAt: null,
    });
    await repository.insertHistory(client, {
      requestId: id,
      previousStatus: current.status,
      status: 'Rejected',
      note: reason,
      changedByUserId: user.id,
    });
  });
  const workOrder = presentWorkOrder(result.workOrder);
  await notifyRequester(workOrder, 'Service request declined', reason, `service-rejected:${id}:${Date.now()}`);
  await writeAudit(workOrder, user, { action: 'rejected', reason: `Service work order rejected. ${reason}`, oldValues: { status: result.current.status } });
  return workOrder;
}

async function confirmService(idValue, input, user) {
  const id = requestId(idValue);
  const note = validateNote(input, 'Confirmation note');
  const result = await repository.withLockedWorkOrder(id, async (client, current) => {
    if (String(current.requesterId) !== String(user.id)) invalid('You can only confirm your own service request.', 403);
    if (current.status !== 'Awaiting Requester Confirmation') invalid('This service request is not awaiting confirmation.', 409);
    await repository.updateRequestStatus(client, { requestId: id, status: 'Closed' });
    await repository.updateWorkOrder(client, id, {
      requesterConfirmedAt: new Date(),
      closedAt: new Date(),
      closedByUserId: user.id,
      closureType: 'REQUESTER_CONFIRMED',
      autoCloseAt: null,
    });
    await repository.insertHistory(client, {
      requestId: id,
      previousStatus: current.status,
      status: 'Closed',
      note: note || 'Requester confirmed that the service issue was resolved.',
      changedByUserId: user.id,
    });
  });
  const workOrder = presentWorkOrder(result.workOrder);
  await notifyTeam(workOrder, 'Requester confirmed completion', 'The requester confirmed that the service issue is resolved.', `service-requester-confirmed:${id}:${workOrder.closedAt || Date.now()}`, { assignedOnly: true });
  await writeAudit(workOrder, user, { reason: 'Requester confirmed service completion.', oldValues: { status: result.current.status } });
  return workOrder;
}

async function reopenService(idValue, input, user) {
  const id = requestId(idValue);
  const { message } = validateReopen(input);
  const result = await repository.withLockedWorkOrder(id, async (client, current) => {
    if (String(current.requesterId) !== String(user.id)) invalid('You can only reopen your own service request.', 403);
    if (current.status !== 'Awaiting Requester Confirmation') invalid('Only a recently completed service request can be reopened.', 409);
    await repository.updateRequestStatus(client, { requestId: id, status: 'In Progress' });
    await repository.updateWorkOrder(client, id, {
      workCompletedAt: null,
      awaitingConfirmationAt: null,
      autoCloseAt: null,
      requesterConfirmedAt: null,
      requesterRemindedAt: null,
      closedAt: null,
      closedByUserId: null,
      closureType: null,
      resolutionType: null,
      completionNote: '',
      incompleteReason: '',
      reopenCount: Number(current.reopenCount || 0) + 1,
    });
    await repository.insertHistory(client, {
      requestId: id,
      previousStatus: current.status,
      status: 'In Progress',
      note: `Requester reopened the service request: ${message}`,
      changedByUserId: user.id,
    });
  });
  const workOrder = presentWorkOrder(result.workOrder);
  await notifyTeam(workOrder, 'Service request reopened', `Requester reported: ${message}`, `service-reopened:${id}:${workOrder.reopenCount}`, { assignedOnly: true });
  await writeAudit(workOrder, user, {
    action: 'updated',
    reason: `Requester reopened the service request: ${message}`,
    oldValues: { status: result.current.status },
  });
  return workOrder;
}

// The requester adds details after submitting, such as the exact room or a photo of the problem. Open jobs only.
async function addRequesterInfo(idValue, input, user) {
  const id = requestId(idValue);
  const { message, photos } = validateRequesterInfo(input);
  const result = await repository.withLockedWorkOrder(id, async (client, current) => {
    if (String(current.requesterId) !== String(user.id)) invalid('You can only add information to your own service request.', 403);
    assertNonTerminal(current);
    await repository.insertPhotos(client, id, photos, { source: 'REQUESTER_UPDATE', userId: user.id });
    await repository.insertHistory(client, {
      requestId: id,
      previousStatus: current.status,
      status: current.status,
      note: `Requester added information: ${message}`,
      changedByUserId: user.id,
    });
  });
  const workOrder = presentWorkOrder(result.workOrder);
  await notifyTeam(workOrder, 'Requester added information', message, `service-requester-info:${id}:${Date.now()}`, { assignedOnly: true });
  await writeAudit(workOrder, user, { reason: `Requester added information to the service request. ${message}`, oldValues: { status: result.current.status } });
  return workOrder;
}

async function notifyNewWorkOrder(request) {
  const raw = await repository.getWorkOrder(null, request.id);
  const workOrder = presentWorkOrder(raw);
  if (!workOrder) return;
  const label = SERVICE_CATEGORY_META[workOrder.serviceCategory]?.label || 'service';
  await notifyTeam(workOrder, 'New service request', `${workOrder.requesterName || 'A requester'} submitted a ${label} job.`, `service-new:${workOrder.id}`);
}

// A cancelled job needs no action from the team, so older open notices for it are cleared.
async function notifyCancelled(request) {
  const workOrder = presentWorkOrder(await repository.getWorkOrder(null, request.id));
  if (!workOrder) return;
  const id = workOrder.id;
  await sideEffect('Notification cleanup', () => Promise.all([
    notificationsRepository.resolveByPrefix(`service-new:${id}:`),
    notificationsRepository.resolveByPrefix(`service-forward:${id}:`),
    notificationsRepository.resolveByPrefix(`service-requester-reply:${id}:`),
  ]));
  await notifyTeam(workOrder, 'Request cancelled by requester', 'The requester cancelled this job. No further action is needed.', `service-cancelled:${id}`);
}

async function notifyRequesterReply(request) {
  const raw = await repository.getWorkOrder(null, request.id);
  const workOrder = presentWorkOrder(raw);
  if (!workOrder) return;
  await notifyTeam(workOrder, 'Requester replied', 'The requester supplied the requested information. Continue the review.', `service-requester-reply:${workOrder.id}:${Date.now()}`, { assignedOnly: true });
}

async function enrichRequest(request, { withPhotos = false } = {}) {
  if (!request || request.requestType !== 'JOB_REQUEST') return request;
  const raw = await repository.getWorkOrder(null, request.id, { withPhotos });
  const workOrder = presentWorkOrder(raw);
  if (!workOrder) return request;
  return {
    ...request,
    serviceWorkflow: workOrder.serviceWorkflow,
    serviceCategory: workOrder.serviceCategory,
    serviceRoute: workOrder.routeTeam,
    priority: workOrder.priority,
    deadlineLabel: workOrder.deadlineLabel,
    targetDate: workOrder.targetDate,
    assignedStaff: workOrder.assignedStaffName || null,
    checklist: workOrder.checklist,
    transfers: workOrder.transfers,
    // Only the single-request view asks for photos, so the request lists stay small.
    ...(withPhotos ? { photos: workOrder.photos || [] } : {}),
  };
}

async function enrichRequests(requests) {
  return Promise.all((requests || []).map((request) => enrichRequest(request)));
}

// Run from the same sweeps as the borrowing and facility reminders (index.js and expiry-sweep.middleware.js).
async function runServiceWorkOrderAutomation() {
  const closedIds = await repository.autoCloseEligible();
  for (const id of closedIds) {
    const workOrder = presentWorkOrder(await repository.getWorkOrder(null, id));
    if (!workOrder) continue;
    const closedMessage = 'Your request was automatically closed after 2 days without feedback. You may submit a new request if the issue returns.';
    await notifyRequester(workOrder, 'Service request closed', closedMessage, `service-auto-closed:${id}`);
    await emailRequester(workOrder, 'Service request closed', closedMessage);
    await writeAudit(workOrder, null, { reason: 'Service request automatically closed after 2 days without requester feedback.', oldValues: { status: 'Awaiting Requester Confirmation' } });
  }

  const requesterReminderIds = await repository.claimRequesterReminderCandidates();
  for (const id of requesterReminderIds) {
    const workOrder = presentWorkOrder(await repository.getWorkOrder(null, id));
    if (!workOrder) continue;
    const reminder = 'Your completed request still needs your confirmation. It closes automatically in about a day if there is no reply.';
    await notifyRequester(workOrder, 'Please confirm service completion', reminder, `service-confirm-reminder:${id}`);
    await emailRequester(workOrder, 'Please confirm your service request', reminder);
  }

  const reminderIds = await repository.claimReminderCandidates();
  for (const id of reminderIds) {
    const workOrder = presentWorkOrder(await repository.getWorkOrder(null, id));
    if (!workOrder) continue;
    const label = workOrder.deadlineLabel;
    if (!label) continue;
    await notifyTeam(workOrder, label.startsWith('Overdue') ? 'Service request overdue' : 'Service deadline reminder', `${label}. Review or continue work on this request.`, `service-deadline:${id}:${toManilaDate()}`, { assignedOnly: true });
  }
  return { autoClosed: closedIds.length, requesterReminders: requesterReminderIds.length, reminders: reminderIds.length };
}

module.exports = {
  presentWorkOrder,
  listWorkOrders,
  listTeamMembers,
  getWorkOrder,
  claimWorkOrder,
  reviewWorkOrder,
  requestMoreInformation,
  forwardWorkOrder,
  startWork,
  progressWork,
  completeWork,
  notFinishWork,
  takeOverWorkOrder,
  rejectWorkOrder,
  confirmService,
  reopenService,
  addRequesterInfo,
  notifyNewWorkOrder,
  notifyCancelled,
  notifyRequesterReply,
  enrichRequest,
  enrichRequests,
  runServiceWorkOrderAutomation,
};
