// Facilities and equipment requests after approval:
// print the slip → release (Issued) → return (Returned / For Repair) → settle missing items → Completed.
// Approval itself reserves the items (requests.repository.js, reserveFacilityEquipment).
const nodemailer = require('nodemailer');
const env = require('../../config/env');
const requestsRepository = require('./requests.repository');
const facilityRepository = require('./facility-flow.repository');
const facilityDamageRepository = require('./facility-damage-payments.repository');
const notificationsRepository = require('../notifications/notifications.repository');
const auditRepository = require('../audit/audit.repository');
const { invalid, text, validateRequestId } = require('./requests.validation');

const mailTransport = env.smtp
  ? nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
  })
  : null;

// Under Maintenance is not offered for facility returns (user's choice, 2026-11-15).
const RETURN_CONDITIONS = new Set(['New', 'Good', 'Fair', 'Needs Repair', 'Unserviceable']);
const REPAIR_CONDITIONS = new Set(['Needs Repair', 'Unserviceable']);
const REPAIR_OWNERS = new Set(['GSO', 'ITSS']);
const SETTLEMENTS = ['Replaced', 'Paid', 'Waived'];
const SLIP_REPRINT_REASONS = ['Damaged or unreadable', 'Torn or peeling', 'Slip lost or missing', 'Printer error', 'Other'];

const dueText = (request) => [request.formData?.date, request.formData?.endTime].filter(Boolean).join(' ');

// Notices are side effects: a failure is logged and never undoes the saved change.
async function emailRequester(request, subject, message) {
  if (!mailTransport || !request?.requesterEmail) return;
  try {
    await mailTransport.sendMail({
      from: env.smtp.from,
      to: request.requesterEmail,
      subject: `${subject}: ${request.referenceNo}`,
      text: [
        `Hello ${request.formData?.requesterName || request.requesterName || ''},`,
        '',
        message,
        '',
        `Reference: ${request.referenceNo}`,
        `Venue: ${request.formData?.venue || '—'}`,
        '',
        'This is an automated message from A.S.SET.',
      ].join('\n'),
    });
  } catch (error) {
    console.error('Facility request email could not be delivered.', { code: error.code, responseCode: error.responseCode });
  }
}

async function noticeRequester(request, title, message) {
  if (!request?.requesterId) return;
  try {
    await notificationsRepository.createUserNotification({
      userId: request.requesterId,
      type: 'REQUEST',
      title,
      message: `${request.referenceNo}: ${message}`,
      href: `/requester/requests/${request.id}`,
      dedupeKey: `facility:${request.id}:${title}:${Date.now()}`,
    });
  } catch (error) {
    console.error('Facility request notice could not be saved.', { code: error.code, referenceNo: request.referenceNo });
  }
  await emailRequester(request, title, message);
}

function noticeRole(roleKey, request, event, title, message, href) {
  if (!request) return Promise.resolve();
  return notificationsRepository.createRoleNotification({
    roleKey,
    type: 'REQUEST',
    title,
    message: `${request.referenceNo}: ${message}`,
    href,
    dedupeKey: `facility-damage-${roleKey.toLowerCase()}:${request.id}:${event}`,
  }).catch((error) => console.error('Facility damage role notice could not be saved.', { code: error.code, referenceNo: request.referenceNo }));
}

// What came back for each released row: how many returned (0 to the released quantity) and how many of those are
// damaged. Damaged units need a damage type (condition); the rest are good. A caller that sends no damaged count
// but a repair condition counts every returned unit as damaged.
function facilityReturnLines(request, provided) {
  const rows = Array.isArray(provided) ? provided : [];
  const open = request.assets.filter((asset) => !asset.returnedAt);
  if (!open.length) invalid('There are no released items to return.', 409);
  return open.map((asset) => {
    const line = rows.find((row) => row && String(row.assetId) === String(asset.id));
    const name = asset.itemName || 'this item';
    const returned = Number(line?.returned);
    if (!line || !Number.isInteger(returned) || returned < 0 || returned > Number(asset.quantity)) {
      invalid(`Enter how many ${name} came back (0 to ${asset.quantity}).`);
    }
    const condition = String(line.condition || 'Good');
    if (!RETURN_CONDITIONS.has(condition)) invalid(`Choose the condition of ${name}.`);
    const damaged = line.damaged === undefined || line.damaged === null || line.damaged === ''
      ? (REPAIR_CONDITIONS.has(condition) ? returned : 0)
      : Number(line.damaged);
    if (!Number.isInteger(damaged) || damaged < 0 || damaged > returned) invalid(`Enter how many ${name} are damaged (0 to ${returned}).`);
    if (damaged > 0 && !REPAIR_CONDITIONS.has(condition)) invalid(`Choose what is wrong with the damaged ${name}.`);
    // A Needs Repair item is repaired by GSO or sent to ITSS; the choice is required, and nothing else needs it.
    const repairOwner = damaged > 0 && condition === 'Needs Repair' ? String(line.repairBy || '') : null;
    if (repairOwner !== null && !REPAIR_OWNERS.has(repairOwner)) invalid(`Choose who repairs the ${name}: GSO or ITSS.`);
    return {
      assetId: String(asset.id),
      returned,
      damaged,
      lost: Number(asset.quantity) - returned,
      condition: damaged > 0 ? condition : (REPAIR_CONDITIONS.has(condition) ? 'Good' : condition),
      repairOwner,
    };
  });
}

// Checks a facility status change before it is saved. Returns the return lines when items come back.
function prepareStatusChange(request, status, input) {
  const hasItems = request.assets.length > 0;
  if (status === 'Issued' && !hasItems) invalid('This request has no items to release.', 409);
  if (status === 'Completed' && request.status === 'Approved' && hasItems) {
    invalid('Release and return the items before you complete this request.', 409);
  }
  if (request.status !== 'Issued' || !['Returned', 'For Repair'].includes(status)) return null;
  const lines = facilityReturnLines(request, input?.returns);
  const damaged = lines.some((line) => line.damaged > 0);
  if (damaged && status !== 'For Repair') invalid('A returned item is damaged. Save it as For Repair.', 409);
  if (!damaged && status === 'For Repair') invalid('No returned item is damaged. Save it as Returned.', 409);
  return lines;
}

// The in-app notices for Issued, Returned, and For Repair come from requests.service.js; this adds the emails
// and the missing-items notice.
async function afterStatusChange(request, status, lines) {
  if (status === 'Issued') {
    await emailRequester(request, 'Items released', `GSO released your items. Keep the slip and bring it back with the items by ${dueText(request)}.`);
  }
  if (status === 'Returned') await emailRequester(request, 'Return confirmed', 'GSO confirmed the return of your items. Thank you.');
  if (status === 'For Repair') {
    const damaged = (lines || []).reduce((total, line) => total + (line.damaged || 0), 0);
    await emailRequester(request, 'Return received', `GSO received your items. ${damaged || 'Some'} of them need repair.`);
    const unserviceable = (lines || []).filter((line) => line.damaged > 0 && line.condition === 'Unserviceable').reduce((total, line) => total + line.damaged, 0);
    if (unserviceable > 0) {
      await noticeRequester(request, 'Unserviceable item needs a decision', `${unserviceable} returned item${unserviceable === 1 ? ' is' : 's are'} marked Unserviceable. GSO will record the no-charge decision.`);
      await noticeRole('GSO_STAFF', request, 'unserviceable', 'Unserviceable facility item needs a decision', `${unserviceable} returned item${unserviceable === 1 ? ' is' : 's are'} marked Unserviceable. Record the no-charge decision.`, `/gso/facility-requests?request=${encodeURIComponent(request.id)}`);
      await noticeRole('GSO_HEAD', request, 'unserviceable', 'Unserviceable facility item reported', `${unserviceable} returned item${unserviceable === 1 ? ' is' : 's are'} marked Unserviceable and needs a settlement decision.`, '/gso-head/items');
    }
    const itssDamaged = (lines || []).filter((line) => line.damaged > 0 && line.repairOwner === 'ITSS').reduce((total, line) => total + line.damaged, 0);
    if (itssDamaged > 0) {
      await noticeRole('IT_ADMIN', request, 'itss-repair', 'Facility item sent to ITSS for a repair check', `${itssDamaged} returned item${itssDamaged === 1 ? ' needs' : 's need'} an ITSS check to see if ${itssDamaged === 1 ? 'it' : 'they'} can still be fixed.`, '/admin/repair');
    }
  }
  const missing = (lines || []).reduce((total, line) => total + line.lost, 0);
  if (missing > 0) {
    await noticeRequester(request, 'Missing items', `${missing} item${missing === 1 ? ' was' : 's were'} not returned. The request is closed and GSO has recorded it for Finance. Contact GSO if you have questions.`);
  }
}

async function settleFacilityItem(idValue, assetIdValue, input, user) {
  const requestId = validateRequestId(idValue);
  if (!/^\d+$/.test(String(assetIdValue))) invalid('Item record not found.', 404);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Choose how the missing item was settled.');
  const status = String(input.status || '');
  if (!SETTLEMENTS.includes(status)) invalid('Choose Replaced, Paid, or Waived.');
  const note = text(input.note, 'settlement note', 500, { optional: true });
  if (status === 'Waived' && !note) invalid('Add the reason for the waiver.');
  const result = await facilityRepository.settleFacilityItem({
    requestId, assetId: String(assetIdValue), status, note, userId: user.id,
  });
  const request = await requestsRepository.getById(null, requestId);
  await noticeRequester(request, 'Missing item settled', `${result.lost} ${result.unit} of ${result.itemName}: ${status}.`);
  return request;
}

async function saveFacilityDamageDecision(idValue, input, user) {
  const requestId = validateRequestId(idValue);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Add the reason for the no-charge decision.');
  const reason = text(input.reason, 'reason for the no-charge decision', 1000);
  const saved = await facilityDamageRepository.saveDecision({ requestId, userId: user.id, reason });
  const request = saved.request;
  await noticeRequester(request, 'Unserviceable item settlement recorded', 'GSO recorded that there is no charge for the returned unserviceable item. The item remains marked Unserviceable in Item Master Data.');
  await noticeRole('GSO_STAFF', request, 'no-charge', 'Facility damage decision recorded', 'No charge was recorded and the returned item remains Unserviceable.', `/gso/facility-requests?request=${encodeURIComponent(request.id)}`);
  await noticeRole('GSO_HEAD', request, 'no-charge', 'Facility damage decision recorded', 'GSO recorded no charge for a returned unserviceable item.', '/gso-head/items');
  return { request: await requestsRepository.getById(null, requestId) };
}

async function recordSlipPrints(input, user) {
  const ids = Array.isArray(input?.requestIds) ? [...new Set(input.requestIds.map(String))] : [];
  if (!ids.length || ids.length > 100 || ids.some((id) => !/^\d+$/.test(id))) invalid('Choose the slips to print.');
  return facilityRepository.recordSlipPrints(ids, user.id);
}

async function reprintSlip(idValue, input, user) {
  const id = validateRequestId(idValue);
  const reason = String(input?.reason || '');
  if (!SLIP_REPRINT_REASONS.includes(reason)) invalid('Choose why the slip is reprinted.');
  const details = text(input.details, 'reprint details', 300, { optional: true });
  if (reason === 'Other' && !details) invalid('Add a short reason for the reprint.');
  const request = await requestsRepository.getById(null, id);
  if (!request || request.requestType !== 'FACILITY_USE' || !request.slipPrintedAt || !['Approved', 'Issued'].includes(request.status)) {
    invalid('This slip cannot be reprinted.', 409);
  }
  await auditRepository.writeLog(null, {
    entityType: 'request',
    entityKey: id,
    entityName: request.referenceNo,
    action: 'updated',
    reason: `Slip reprinted for ${request.referenceNo}. Reason: ${details ? `${reason}: ${details}` : reason}.`,
    newValues: { reprintReason: reason, reprintDetails: details || null },
    changedByUserId: user.id,
    requestId: id,
    flag: 'LABEL_REPRINT',
  });
  return request;
}

async function sendFacilityOverdueReminders() {
  const ids = await facilityRepository.claimOverdueFacilityReminders(10);
  for (const id of ids) {
    const request = await requestsRepository.getById(null, id);
    if (request) await noticeRequester(request, 'Items overdue', `Please return the items to GSO now. They were due on ${dueText(request)}.`);
  }
  return ids.length;
}

async function financeReport() {
  return facilityRepository.listFinanceReport();
}

module.exports = {
  SLIP_REPRINT_REASONS,
  prepareStatusChange,
  afterStatusChange,
  settleFacilityItem,
  saveFacilityDamageDecision,
  recordSlipPrints,
  reprintSlip,
  sendFacilityOverdueReminders,
  financeReport,
};
