// Loss & Damage Cases: GSO Staff review each Loss / Damage Report and choose one resolution.
//   No charge         → the case closes at once.
//   For repair        → In Progress → GSO repairs the item → Close → Closed.
//   Payment required  → In Progress → PayMongo test checkout (GCash only) → a verified webhook marks it paid and moves the
//                       item out of the requester's holdings → Close → Closed.
// The request keeps its existing statuses; loss_damage_settlements holds the decision and the payment.
// Only a verified PayMongo webhook can mark a case paid. The browser's success page never does.
const crypto = require('node:crypto');
const env = require('../../config/env');
const requestsRepository = require('../requests/requests.repository');
const notificationsRepository = require('../notifications/notifications.repository');
const auditRepository = require('../audit/audit.repository');
const { validateRequestId } = require('../requests/requests.validation');
const repository = require('./loss-damage.repository');
const paymongo = require('./paymongo');

const RESOLUTION_LABELS = { NO_CHARGE: 'No charge', FOR_REPAIR: 'For repair', PAYMENT_REQUIRED: 'Payment required' };
const GSO_PAGE = '/gso/loss-damage-cases';

// Errors the user can read. Setup and PayMongo messages are shown as written, even with a 5xx status.
const fail = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });

const pesoFormat = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const peso = (centavos) => pesoFormat.format(centavos / 100);

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

// "1500", "1,500", "1500.5" or "1500.50" pesos → centavos. PayMongo accepts PHP 1.00 to PHP 9,999,999.99.
function amountInCentavos(value) {
  const typed = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim().replace(/,/g, '') : '';
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(typed);
  if (!match) throw fail('Enter the amount in pesos, for example 1500 or 1500.50.');
  const centavos = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  if (centavos < 100) throw fail('The amount must be at least ₱1.00.');
  return centavos;
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

// Role notices get ":<user id>" added by the repository, so the prefix "loss-damage-staff:<id>:" clears them.
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

// Every staff response carries the case as it is now, and whether the PayMongo test setup is complete.
async function caseResult(id, extra = {}) {
  return { case: await loadCase(id), setup: paymongo.setupState(), ...extra };
}

async function listCases() {
  const requests = await requestsRepository.listAll({ requestType: 'LOSS_DAMAGE_REPORT', status: '', search: '' });
  const settlements = await repository.listSettlements(requests.map((request) => String(request.id)));
  return {
    cases: requests.map((request) => ({ ...request, settlement: settlements.get(String(request.id)) || null })),
    setup: paymongo.setupState(),
  };
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

// After paying, PayMongo sends the requester back to the request page of this report.
function returnPageFor(id) {
  const origin = Array.isArray(env.frontendOrigin) ? env.frontendOrigin[0] : env.frontendOrigin;
  return `${origin}/requester/requests/${id}`;
}

// Creates the GCash test checkout for a case that is waiting for one, then tells the requester to pay.
async function createLinkFor(id, userId) {
  if (!paymongo.setupState().paymentLinks) throw fail(paymongo.SETUP_MESSAGE, 503);
  const current = await loadCase(id);
  const settlement = current.settlement;
  if (current.status !== 'In Progress' || settlement?.status !== 'PENDING_LINK') {
    throw fail(settlement?.status === 'AWAITING_PAYMENT' ? 'This case already has a GCash payment.' : 'This case does not need a payment.', 409);
  }
  const amount = settlement.amountCentavos;
  const page = returnPageFor(id);
  const checkout = await paymongo.createCheckoutSession({
    referenceNumber: current.referenceNo,
    description: `Loss & Damage case ${current.referenceNo}`,
    amountCentavos: amount,
    successUrl: page,
    cancelUrl: page,
    metadata: { requestId: String(id), kind: 'loss_damage' },
  });
  const attached = await repository.attachLink({
    requestId: id,
    amountCentavos: amount,
    link: checkout,
    userId,
    note: `GCash test checkout created for ${peso(amount)}.`,
  });
  if (!attached) {
    // The case changed while the checkout was being made (a new decision or another staff member): never leave it payable.
    await paymongo.cancelPaymentCheckout(checkout.id).catch(() => console.error('An unused PayMongo checkout could not be expired.'));
    throw fail('The case changed while the checkout was being made. Refresh the page.', 409);
  }
  const request = await requestsRepository.getById(null, id);
  await notifyRequester(request, 'link', 'Payment needed', `Pay ${peso(amount)} with GCash on your request page. This is a test: no real money is charged.`);
  await audit(request, userId, `GCash test checkout created for ${peso(amount)}.`, { amountCentavos: amount, checkoutId: checkout.id });
}

async function decide(idValue, input, user) {
  const id = validateRequestId(idValue);
  const resolution = typeof input?.resolution === 'string' ? input.resolution : '';
  if (!RESOLUTION_LABELS[resolution]) throw fail('Choose No charge, For repair, or Payment required.');
  const reason = requiredText(input.reason, 'reason for the decision', 1000);
  const amountCentavos = resolution === 'PAYMENT_REQUIRED' ? amountInCentavos(input.amount) : null;
  const summary = `${RESOLUTION_LABELS[resolution]}${amountCentavos ? ` (${peso(amountCentavos)})` : ''}`;

  const { request, changed } = await repository.saveDecision({
    id,
    userId: user.id,
    resolution,
    reason,
    amountCentavos,
    summary,
    resolvedUnits: input?.resolvedUnits,
  });
  await resolveNotices(`staff-new:${id}:`, `staff-reply:${id}:`);
  await audit(request, user.id, `${changed ? 'Decision changed' : 'Decision'}: ${summary}. Reason: ${reason}`, { resolution, amountCentavos });

  // The decision is saved first. If the GCash checkout cannot be made, the case waits and GSO sees why.
  let linkError = '';
  if (resolution === 'PAYMENT_REQUIRED') {
    try {
      await createLinkFor(id, user.id);
    } catch (error) {
      if (!error.status) throw error;
      linkError = error.message;
    }
  }

  if (resolution === 'NO_CHARGE') {
    await notifyRequester(request, 'decision', 'No charge for your report', `GSO decided there is nothing to pay, and the case is closed. Reason: ${reason}`);
  } else if (resolution === 'FOR_REPAIR') {
    await notifyRequester(request, 'decision', 'GSO will repair the item', `No payment is needed. GSO will repair the item and close the case afterwards. Reason: ${reason}`);
  } else if (linkError) {
    await notifyRequester(request, 'decision', 'Payment required', `GSO decided you need to pay ${peso(amountCentavos)}. The payment will follow. Reason: ${reason}`);
  }
  return caseResult(id, { linkError });
}

async function createPaymentLink(idValue, user) {
  const id = validateRequestId(idValue);
  await createLinkFor(id, user.id);
  return caseResult(id);
}

async function cancelPaymentLink(idValue, input, user) {
  const id = validateRequestId(idValue);
  const reason = requiredText(input?.reason, 'reason for cancelling the payment', 500);
  const settlement = (await loadCase(id)).settlement;
  if (settlement?.status !== 'AWAITING_PAYMENT' || !settlement.linkId) throw fail('This case has no open payment.', 409);
  // Expire or archive at PayMongo first, so the requester cannot pay a checkout the case no longer uses.
  await paymongo.cancelPaymentCheckout(settlement.linkId);
  const cleared = await repository.clearLink({
    requestId: id,
    linkId: settlement.linkId,
    userId: user.id,
    note: `GCash payment cancelled. Reason: ${reason}`,
  });
  if (!cleared) {
    const latest = await repository.getSettlement(null, id);
    throw fail(latest?.status === 'PAID' ? 'PayMongo already confirmed this payment, so the case stays paid.' : 'The case changed. Refresh the page.', 409);
  }
  const request = await requestsRepository.getById(null, id);
  await notifyRequester(request, 'link-cancelled', 'Payment cancelled', `Do not pay the old GCash checkout. GSO will update your case. Reason: ${reason}`);
  await audit(request, user.id, `GCash test checkout cancelled. Reason: ${reason}`, { checkoutId: settlement.linkId });
  return caseResult(id);
}

async function closeCase(idValue, input, user) {
  const id = validateRequestId(idValue);
  if (input?.handled !== true) throw fail('Confirm that the physical follow-up is done before you close the case.');
  const note = optionalText(input.note, 'closing note', 1000);
  const { request, settlementStatus } = await repository.closeCase({
    id,
    userId: user.id,
    note: note ? `Case closed. Note: ${note}` : 'Case closed.',
  });
  await resolveNotices(`loss-damage-staff:${id}:`);
  await notifyRequester(request, 'closed', 'Case closed',
    `${settlementStatus === 'PAID' ? 'Your test payment was confirmed, and GSO closed the case.' : 'GSO finished the repair and closed the case.'}${note ? ` Note from GSO: ${note}` : ''}`);
  await audit(request, user.id, note ? `Loss / damage case closed. Note: ${note}` : 'Loss / damage case closed.');
  return caseResult(id);
}

// The requester sees the decision and their own payment state. The checkout link is sent only while it can be paid.
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
      amountCentavos: settlement.amountCentavos,
      currency: settlement.currency,
      status: settlement.status,
      decidedAt: settlement.assessedAt,
      checkoutUrl: settlement.status === 'AWAITING_PAYMENT' ? settlement.checkoutUrl : null,
      paidAt: settlement.paidAt,
    } : null,
  };
}

const WARNING_TEXT = {
  REJECTED_STATE: 'a payment on a cancelled or already paid checkout',
  REJECTED_CURRENCY: 'a payment in another currency',
  REJECTED_AMOUNT: 'a payment with a different amount',
  REJECTED_LIVE: 'a live-mode event',
};

async function notifyProcessedPayment(result) {
  const request = await requestsRepository.getById(null, result.requestId);
  if (!request) return;
  const inventory = result.inventory || { moved: [], summary: '' };
  const amount = peso(result.amountCentavos);
  const moved = inventory.moved.length > 0;
  if (request.requestType === 'FACILITY_USE') {
    const availableSummary = inventory.availableSummary || 'Item Master Data was refreshed.';
    const completed = inventory.completed === true;
    const completionMessage = completed
      ? `The facility request status is now Completed. ${availableSummary}.`
      : `The payment was recorded, but the request remains ${inventory.requestStatus}. ${inventory.pendingOtherSettlements} other returned item${inventory.pendingOtherSettlements === 1 ? '' : 's'} still need settlement.`;
    await resolveNotices(
      `facility:${request.id}:`,
      `facility-damage-staff:${request.id}:`,
      `facility-damage-head:${request.id}:`,
      `facility-damage-gso_staff:${request.id}:`,
      `facility-damage-gso_head:${request.id}:`,
    );
    await notifyRequester(request, 'facility-paid', completed ? 'Facility request completed after payment' : 'Facility damage payment confirmed', `PayMongo confirmed your test payment of ${amount}. ${completionMessage}`);
    await sideEffect('Facility GSO Staff payment notice', () => notificationsRepository.createRoleNotification({
      roleKey: 'GSO_STAFF', type: 'REQUEST', title: completed ? 'Facility request completed after payment' : 'Facility damage payment confirmed',
      message: `${request.referenceNo}: PayMongo confirmed the test payment of ${amount}. ${completionMessage} ${inventory.summary}.`,
      href: '/gso/facility-requests', dedupeKey: `facility-damage-staff:${request.id}:paid`,
    }));
    await sideEffect('Facility GSO Head payment notice', () => notificationsRepository.createRoleNotification({
      roleKey: 'GSO_HEAD', type: 'REQUEST', title: 'Facility damage payment confirmed',
      message: `${request.referenceNo}: PayMongo confirmed the test payment of ${amount}. ${completionMessage} ${inventory.summary}.`,
      href: '/gso-head/items', dedupeKey: `facility-damage-head:${request.id}:paid`,
    }));
  } else {
    await notifyRequester(request, 'paid', 'Payment confirmed', `PayMongo confirmed your test payment of ${amount}.${moved ? ' The reported item is no longer issued to you.' : ''} GSO will close the case after any needed follow-up.`);
    await notifyStaff(request, 'paid', 'Payment confirmed: close the case', `PayMongo confirmed the test payment of ${amount}. ${inventory.summary} Finish any follow-up, then close the case.`);
    await notifyHead(request, 'paid', 'Loss / damage payment confirmed', `PayMongo confirmed the test payment of ${amount}. ${inventory.summary} Item Master Data has been updated.`);
  }
  await audit(request, null, `PayMongo confirmed the test payment of ${amount}${result.paymentId ? ` (${result.paymentId})` : ''}.`, { paymentId: result.paymentId });
}

// PayMongo should call the webhook, but local backends and misconfigured test webhooks cannot receive it.
// Read the Checkout Session from the backend, then feed a paid payment through the same transaction path.
async function reconcileFacilityDamagePayment(requestId) {
  const settlement = await repository.getSettlement(null, requestId);
  if (!settlement || settlement.status !== 'AWAITING_PAYMENT' || !String(settlement.linkId || '').startsWith('cs_')) return null;

  try {
    const checkout = await paymongo.getCheckoutSession(settlement.linkId);
    const resource = checkout?.data;
    const attributes = resource?.attributes || {};
    if (attributes.livemode !== false) return null;
    const payments = Array.isArray(attributes.payments) ? attributes.payments.map((entry) => entry?.data || entry).filter(Boolean) : [];
    const paid = payments.find((entry) => (entry.attributes?.status || entry.status) === 'paid');
    if (!paid?.id) return null;

    const event = paymongo.readEvent({
      data: {
        id: `reconcile:${settlement.linkId}:${paid.id}`,
        type: 'event',
        attributes: {
          type: 'checkout_session.payment.paid',
          livemode: false,
          created_at: attributes.updated_at || attributes.created_at,
          data: resource,
        },
      },
    });
    const result = await repository.processWebhookEvent({
      ...event,
      payloadSha256: crypto.createHash('sha256').update(JSON.stringify(checkout)).digest('hex'),
      receivedAt: new Date(),
    });
    if (result.outcome === 'PROCESSED') await notifyProcessedPayment(result);
    return result;
  } catch (error) {
    console.error('Facility payment reconciliation could not be completed.', { requestId, code: error.code, message: error.message });
    return null;
  }
}

// PayMongo → POST /api/v1/loss-damage/webhooks/paymongo with the raw body. Only a valid test-mode signature counts.
async function receivePaymongoWebhook({ rawBody, signature }) {
  const secret = paymongo.webhookSecret();
  if (!secret) throw fail('The PayMongo webhook is not set up on this server yet. Add PAYMONGO_WEBHOOK_SECRET to the backend settings.', 503);
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) throw fail('The webhook body is empty.');
  const check = paymongo.verifySignature(rawBody, signature, secret);
  if (check === 'expired') throw fail('The webhook signature is too old.');
  if (check !== 'valid') throw fail('The webhook signature is not valid.', 401);
  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw fail('The webhook body is not valid JSON.');
  }
  const event = paymongo.readEvent(body);
  // Some deliveries carry no event id. A checkout session produces one paid payment, so the payment id is the key then.
  if (!event.eventId && event.paymentId) event.eventId = `payment:${event.paymentId}`;
  if (!event.eventId) throw fail('The webhook event has no id.');

  const result = await repository.processWebhookEvent({
    ...event,
    payloadSha256: crypto.createHash('sha256').update(rawBody).digest('hex'),
    receivedAt: new Date(),
  });
  if (result.outcome === 'PROCESSED') {
    await notifyProcessedPayment(result);
  } else if (WARNING_TEXT[result.outcome] && result.requestId && !result.alreadyPaid) {
    const request = await requestsRepository.getById(null, result.requestId);
    await notifyStaff(request, `warning:${Date.now()}`, 'Payment needs checking', `PayMongo reported ${WARNING_TEXT[result.outcome]}. It was not applied. Check the PayMongo dashboard.`);
  }
  if (result.outcome !== 'PROCESSED' && result.outcome !== 'DUPLICATE') {
    console.warn('A PayMongo webhook event was logged without changing a case.', { outcome: result.outcome });
  }
  return { outcome: result.outcome };
}

module.exports = {
  amountInCentavos,
  listCases,
  getCase,
  startReview,
  decide,
  createPaymentLink,
  cancelPaymentLink,
  closeCase,
  getMine,
  reconcileFacilityDamagePayment,
  receivePaymongoWebhook,
};
