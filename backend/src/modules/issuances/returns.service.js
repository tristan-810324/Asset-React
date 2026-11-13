const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const { waitUntil } = require('@vercel/functions');
const env = require('../../config/env');
const returnsRepository = require('./returns.repository');
const notificationsRepository = require('../notifications/notifications.repository');

// In-app notices for a return. They never block the return itself, so a failure is only logged.
async function notifyReturnRecorded({ employeeCode, requesterTitle, requesterMessage, requesterKey, departmentHeadMessage, headMessage, headKey }) {
  try {
    const requesterUserId = await notificationsRepository.userIdForEmployeeCode(employeeCode);
    if (requesterUserId) {
      await notificationsRepository.createUserNotification({
        userId: requesterUserId, type: 'RETURN', title: requesterTitle, message: requesterMessage,
        href: '/requester/issued-items', dedupeKey: requesterKey,
      });
    }
    // The department head who handed the item out is told about every return, not only lost or typed ones.
    const departmentHeadUserId = await notificationsRepository.headUserIdForEmployeeCode(employeeCode);
    if (departmentHeadUserId && departmentHeadUserId !== requesterUserId) {
      await notificationsRepository.createUserNotification({
        userId: departmentHeadUserId, type: 'RETURN', title: 'Item returned to GSO', message: departmentHeadMessage,
        href: '/requester/my-requests', dedupeKey: `${requesterKey}:department-head`,
      });
    }
    if (headMessage) {
      await notificationsRepository.createRoleNotification({
        roleKey: 'GSO_HEAD', type: 'RETURN', title: headMessage.title, message: headMessage.message,
        href: '/gso-head/audit-logs?flag=any', dedupeKey: headKey,
      });
    }
  } catch (error) {
    console.error('Return notification could not be saved.', { code: error.code });
  }
}

// Conditions GSO can record for units physically returned to the counter.
const returnLineConditions = ['New', 'Good', 'Fair', 'Needs Repair', 'Under Maintenance', 'Unserviceable'];
const approvalActions = ['Written Off', 'Paid', 'Replaced'];

const mailTransport = env.smtp
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
      // Without these, a stalled mail server holds a request open for minutes.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  : null;

function httpError(status, message, expose = status < 500) {
  return Object.assign(new Error(message), { status, expose });
}

function requiredText(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim()) {
    throw httpError(400, `Pakilagay ang ${label}.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw httpError(400, `Hindi dapat lumampas sa ${maxLength} characters ang ${label}.`);
  }
  return trimmed;
}

function validateCreateReturn(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError(400, 'Hindi valid ang item return request.');
  }
  const employeeCode = requiredText(input.employeeCode, 'employee code', 40);
  const itemCode = requiredText(input.itemCode, 'item code', 100);
  const reason = requiredText(input.reason, 'return reason o notes', 1000);
  const issuanceId = String(input.issuanceId ?? '');
  if (!/^\d{1,20}$/.test(issuanceId)) throw httpError(400, 'Piliin ang issued item na isosoli.');
  return { employeeCode, itemCode, reason, issuanceId };
}

// A bulk return lists how many units came back in each condition, e.g. 3 Good and 2 Needs Repair.
// The canonical breakdown string is what the employee's code is bound to.
function readReturnLines(input) {
  const rawLines = Array.isArray(input.lines) ? input.lines : [{ condition: input.condition, quantity: input.quantity }];
  if (rawLines.length < 1 || rawLines.length > returnLineConditions.length) {
    throw httpError(400, 'Ilagay ang quantity bawat condition ng ibinabalik.');
  }
  const seen = new Set();
  const lines = rawLines.map((line) => {
    const condition = typeof line?.condition === 'string' ? line.condition.trim() : '';
    const quantity = Number(line?.quantity);
    if (!returnLineConditions.includes(condition)) throw httpError(400, 'Pumili ng valid na return condition.');
    if (seen.has(condition)) throw httpError(400, 'Isang linya lang bawat condition.');
    seen.add(condition);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2147483647) {
      throw httpError(400, 'Ang quantity na isosoli ay dapat whole number na hindi bababa sa 1.');
    }
    return { condition, quantity };
  });
  lines.sort((left, right) => returnLineConditions.indexOf(left.condition) - returnLineConditions.indexOf(right.condition));
  return {
    lines,
    total: lines.reduce((sum, line) => sum + line.quantity, 0),
    breakdown: lines.map((line) => `${line.condition}:${line.quantity}`).join('|'),
  };
}

function readReturnedByName(input) {
  if (input.returnedByName === undefined || input.returnedByName === null || input.returnedByName === '') return null;
  return requiredText(input.returnedByName, 'pangalan ng nagsauli', 200);
}

function readId(value, label) {
  const id = String(value ?? '');
  if (!/^\d{1,20}$/.test(id)) throw httpError(400, `Hindi valid ang ${label}.`);
  return id;
}

function formatManilaDateTime(value) {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
    .format(new Date(value));
}

// Sends a receipt after the response, so a slow mail server never holds up a saved return.
// Returns whether a receipt was queued.
function emailReceiptInBackground({ returnIds, to, employeeName, title, intro, details, warning }) {
  if (!mailTransport || !to) return false;
  const task = (async () => {
    await mailTransport.sendMail({
      from: env.smtp.from,
      to,
      subject: title,
      text: [
        `Dear ${employeeName},`,
        '',
        intro,
        '',
        ...details.map(([label, value]) => `${label}: ${value}`),
        '',
        warning,
        '',
        'General Services Office',
      ].join('\n'),
      html: [
        '<div style="margin:0;background:#f1f5f9;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a">',
        '<div style="max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:18px;background:#ffffff;padding:32px">',
        '<div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#2563eb">A.SSET | GSO</div>',
        `<h1 style="margin:16px 0 8px;font-size:22px">${escapeHtml(title)}</h1>`,
        `<p style="margin:0 0 24px;color:#475569">Dear ${escapeHtml(employeeName)}, ${escapeHtml(intro)}</p>`,
        '<div style="border:1px solid #e2e8f0;border-radius:12px;padding:18px">',
        ...details.map(([label, value]) => `<div style="margin-top:8px;color:#334155">${escapeHtml(label)}: <strong>${escapeHtml(value)}</strong></div>`),
        '</div>',
        `<p style="margin:24px 0 0;padding:12px 14px;border-radius:10px;background:#fef3c7;color:#92400e;font-weight:700">${escapeHtml(warning)}</p>`,
        '<p style="margin:20px 0 0;color:#475569"><strong>General Services Office</strong></p>',
        '</div>',
        '</div>',
      ].join(''),
    });
    for (const id of returnIds) {
      await returnsRepository.markReturnEmailSent(id).catch(() => {
        console.error('Return receipt email was sent, but its sent time could not be recorded.');
      });
    }
  })().catch((error) => {
    console.error('Employee return receipt email could not be delivered.', {
      code: error.code,
      responseCode: error.responseCode,
      command: error.command,
    });
  });
  waitUntil(task);
  return true;
}

const receiptWarning = 'If you did not return these items, or the details are wrong, report it to the General Services Office immediately.';

function validateToken(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{40,128}$/.test(value)) {
    throw httpError(400, 'Hindi valid o wala na ang return approval link.');
  }
  return value;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

async function createEmployeeReturn(input, user) {
  const { employeeCode, itemCode, reason, issuanceId } = validateCreateReturn(input);
  const { lines, total, breakdown } = readReturnLines(input);
  const returnedByName = readReturnedByName(input);
  const { challengeId, otp } = readOtpInput(input, 'Kailangan ang 6-digit code na ipinadala sa email ng employee para makumpirma ang quantity at condition.');
  const otpHash = hashBulkReturnOtp(issuanceId, otp);
  assertOtpAccepted(await returnsRepository.verifyBulkReturnOtp({
    challengeId, issuanceId, quantity: total, condition: breakdown, otpHash,
  }));
  const token = crypto.randomBytes(32).toString('base64url');
  const returned = await returnsRepository.confirmReturnByGso({
    employeeCode,
    itemCode,
    issuanceId,
    lines,
    otpBreakdown: breakdown,
    reason,
    returnedByName,
    otpChallengeId: challengeId,
    otpHash,
    tokenHash: hashToken(token),
    requestedByUserId: user.id,
  });

  const unit = returned.unit_of_measure;
  const lostQuantity = lines.filter((line) => line.condition === 'Lost').reduce((sum, line) => sum + line.quantity, 0);
  const emailQueued = emailReceiptInBackground({
    returnIds: returned.lines.map((line) => line.id),
    to: returned.employee_email,
    employeeName: returned.employee_name,
    title: `Return receipt: ${returned.description} (${returned.item_code})`,
    intro: lostQuantity
      ? 'the General Services Office recorded this return from you, including units reported lost. Lost units stay your accountability until GSO records a settlement.'
      : 'the General Services Office recorded this return from you. Thank you for taking care of the school equipment.',
    details: [
      ['Item', `${returned.description} (${returned.item_code})`],
      ...returned.lines.map((line) => [line.condition === 'Lost' ? 'Reported lost' : `Returned in ${line.condition} condition`, `${line.quantity} ${unit}`]),
      ['Still assigned to you', `${returned.remaining_quantity} ${unit}`],
      ['Recorded on', formatManilaDateTime(returned.lines[0].decidedAt)],
      ...(returnedByName ? [['Brought in by', returnedByName]] : []),
      ['Reason and notes', reason],
      ['Processed by', user.name || user.email],
    ],
    warning: receiptWarning,
  });

  const returnedQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  await notifyReturnRecorded({
    employeeCode: returned.employee_code,
    requesterTitle: 'Return recorded',
    requesterMessage: `GSO recorded ${returnedQuantity} ${unit} of ${returned.description} returned by you.${lostQuantity ? ` ${lostQuantity} reported lost and still your responsibility until settled.` : ''}`,
    requesterKey: `requester-return:bulk:${returned.id}`,
    departmentHeadMessage: `${returnedQuantity} ${unit} of ${returned.description} (${returned.item_code}) was returned to GSO from staff ${returned.employee_code}.`,
    headMessage: lostQuantity ? {
      title: 'Item reported lost',
      message: `${lostQuantity} ${unit} of ${returned.description} (${returned.item_code}) was reported lost. Review the audit entry.`,
    } : null,
    headKey: `head-return-review:bulk:${returned.id}`,
  });

  return {
    id: returned.id,
    lines: returned.lines.map((line) => ({ id: String(line.id), status: line.status, condition: line.condition, quantity: line.quantity })),
    confirmationMethod: returned.confirmationMethod,
    employeeCode: returned.employee_code,
    employeeName: returned.employee_name,
    itemCode: returned.item_code,
    itemName: returned.description,
    quantity: returned.quantity,
    remainingQuantity: returned.remaining_quantity,
    unitOfMeasure: unit,
    reason,
    emailQueued,
  };
}

async function confirmScannedTagReturn(tagCodeValue, input, user) {
  if (typeof tagCodeValue !== 'string' || !/^AST-(?:[A-Z0-9]{13}|[A-F0-9]{20})$/i.test(tagCodeValue.trim())) {
    throw httpError(400, 'I-scan ang unique barcode ng physical unit bago kumpirmahin ang return.');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError(400, 'Hindi valid ang item return confirmation.');
  }
  const condition = requiredText(input.condition, 'condition pagkatapos ng GSO inspection', 40);
  if (!returnLineConditions.includes(condition)) {
    throw httpError(400, 'Pumili ng valid na return condition.');
  }
  const isLost = condition === 'Lost';
  const reason = typeof input.reason === 'string' && input.reason.trim()
    ? requiredText(input.reason, 'return notes', 1000)
    : `GSO confirmed the item return in condition: ${condition}.`;
  const returnedByName = readReturnedByName(input);
  const serialLast4 = typeof input.serialLast4 === 'string' ? input.serialLast4.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4) : '';
  // A returned unit goes back to GSO; giving it to someone else is a new issuance they acknowledge.
  if (input.destination !== undefined && input.destination !== 'storage') {
    throw httpError(400, 'Ibalik muna sa GSO Storage ang unit, saka i-issue sa bagong empleyado sa Main Issuance.');
  }
  // Reported by the browser from keystroke timing, so it flags typed codes for review; it is not proof of a scan.
  const entryMethod = input.entryMethod === 'scan' ? 'scan' : 'typed';
  const tagCode = tagCodeValue.trim().toUpperCase();
  const { challengeId: otpChallengeId, otp } = readOtpInput(input, isLost
    ? 'Kailangan ang 6-digit code ng employee para maitalang nawala ang unit.'
    : 'Kailangan ang 6-digit code na ipinadala sa email ng employee para makumpirma ang return.');
  const otpHash = hashReturnOtp(tagCode, otp);
  assertOtpAccepted(await returnsRepository.verifyReturnOtp({ challengeId: otpChallengeId, tagCode, otpHash }));
  const token = crypto.randomBytes(32).toString('base64url');
  const result = await returnsRepository.confirmScannedTagReturn({
    tagCode,
    condition,
    reason,
    entryMethod,
    returnedByName,
    serialLast4,
    otpChallengeId,
    otpHash,
    tokenHash: hashToken(token),
    requestedByUserId: user.id,
  });

  const emailQueued = emailReceiptInBackground({
    returnIds: [result.id],
    to: result.employeeEmail,
    employeeName: result.employeeName,
    title: `${isLost ? 'Lost item record' : 'Return receipt'}: ${result.itemName} (${result.tagCode})`,
    intro: isLost
      ? 'the General Services Office recorded that this unit was lost while assigned to you. It stays your accountability until GSO records a settlement.'
      : 'the General Services Office recorded the return of this item from you.',
    details: [
      ['Item', `${result.itemName} (${result.itemCode})`],
      ['Unit barcode', result.tagCode],
      [isLost ? 'Reported on' : 'Returned on', formatManilaDateTime(result.decidedAt)],
      ['Condition recorded by GSO', condition],
      ['Sent to', result.destination],
      ...(returnedByName ? [['Brought in by', returnedByName]] : []),
      ['Reason and notes', reason],
      ['Processed by', user.name || user.email],
    ],
    warning: receiptWarning,
  });

  // Lost units and typed codes are the cases the GSO Head should review in Audit Logs.
  const flagged = isLost || entryMethod === 'typed';
  await notifyReturnRecorded({
    employeeCode: result.employeeCode,
    requesterTitle: isLost ? 'Item recorded as lost' : 'Return confirmed',
    requesterMessage: isLost
      ? `${result.itemName} (${result.tagCode}) was recorded as lost while assigned to you. It stays your responsibility until GSO records a settlement.`
      : `GSO received ${result.itemName} (${result.tagCode}) from you. Your return is complete.`,
    requesterKey: `requester-return:${result.id}`,
    departmentHeadMessage: `${result.itemName} (${result.tagCode}) was ${isLost ? 'reported lost' : 'returned to GSO'} from staff ${result.employeeCode}.`,
    headMessage: flagged ? {
      title: isLost ? 'Item reported lost' : 'Return entered by typing the code',
      message: isLost
        ? `${result.itemName} (${result.tagCode}) was reported lost. Review the audit entry and the settlement.`
        : `${result.itemName} (${result.tagCode}) was returned with a typed code, not a scan. Review the audit entry.`,
    } : null,
    headKey: `head-return-review:${result.id}`,
  });

  return { ...result, entryMethod, emailQueued };
}

function hashReturnOtp(tagCode, otp) {
  return crypto.createHmac('sha256', env.jwtSecret).update(`return-otp:${tagCode}:${otp}`).digest('hex');
}

function hashBulkReturnOtp(issuanceId, otp) {
  return crypto.createHmac('sha256', env.jwtSecret).update(`bulk-return-otp:${issuanceId}:${otp}`).digest('hex');
}

function maskEmail(email) {
  const [name, domain] = String(email).split('@');
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(name.length - 2, 1))}@${domain}`;
}

function newReturnOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function requireMailTransport(fallbackHint) {
  if (!mailTransport) {
    throw httpError(503, `Hindi naka-configure ang email, kaya hindi maipadala ang code. ${fallbackHint}`, true);
  }
}

function readOtpInput(input, missingMessage) {
  const otp = typeof input.otp === 'string' ? input.otp.trim() : '';
  if (typeof input.otpChallengeId !== 'string' || !/^\d{1,20}$/.test(input.otpChallengeId) || !/^\d{6}$/.test(otp)) {
    throw httpError(400, missingMessage);
  }
  return { challengeId: input.otpChallengeId, otp };
}

function assertOtpAccepted(check) {
  if (check.status === 'ok') return;
  if (check.status === 'wrong') {
    throw httpError(400, check.attemptsLeft > 0
      ? `Mali ang code. ${check.attemptsLeft} subok na lang ang natitira.`
      : 'Mali ang code at naubos na ang mga subok. Magpadala ng bagong code.');
  }
  if (check.status === 'changed') {
    throw httpError(400, 'Nagbago ang quantity o condition mula nang ipadala ang code. Magpadala ng bagong code.');
  }
  throw httpError(400, 'Nag-expire o nagamit na ang code ng employee. Magpadala ng bagong code.');
}

async function emailReturnCode({ to, employeeName, summary, otp, warning }) {
  try {
    await mailTransport.sendMail({
      from: env.smtp.from,
      to,
      subject: `Return confirmation code: ${otp}`,
      text: [
        `Dear ${employeeName},`,
        '',
        summary,
        '',
        `Your confirmation code: ${otp}`,
        'It expires in 10 minutes.',
        '',
        warning,
        '',
        'General Services Office',
      ].join('\n'),
      html: [
        '<div style="margin:0;background:#f1f5f9;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a">',
        '<div style="max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:18px;background:#ffffff;padding:32px">',
        '<div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#2563eb">A.SSET | GSO</div>',
        '<h1 style="margin:16px 0 8px;font-size:22px">Return confirmation code</h1>',
        `<p style="margin:0 0 20px;color:#475569">Dear ${escapeHtml(employeeName)}, ${escapeHtml(summary)}</p>`,
        `<div style="margin:0 0 8px;font-size:32px;font-weight:800;letter-spacing:8px">${otp}</div>`,
        '<p style="margin:0 0 20px;color:#64748b">It expires in 10 minutes.</p>',
        `<p style="margin:0;padding:12px 14px;border-radius:10px;background:#fef3c7;color:#92400e;font-weight:700">${escapeHtml(warning)}</p>`,
        '</div>',
        '</div>',
      ].join(''),
    });
  } catch (error) {
    console.error('Return confirmation code email could not be delivered.', {
      code: error.code,
      responseCode: error.responseCode,
      command: error.command,
    });
    throw httpError(502, 'Hindi naipadala ang code sa email ng employee. Subukan ulit.', true);
  }
}

// Emails the borrower a one-time code; every tagged return needs it, which proves the borrower took part.
async function sendTaggedReturnOtp(tagCodeValue, user) {
  if (typeof tagCodeValue !== 'string' || !/^AST-(?:[A-Z0-9]{13}|[A-F0-9]{20})$/i.test(tagCodeValue.trim())) {
    throw httpError(400, 'Hindi valid ang unit barcode.');
  }
  requireMailTransport('Ipaayos muna sa IT Admin ang email settings.');
  const tagCode = tagCodeValue.trim().toUpperCase();
  const otp = newReturnOtp();
  const challenge = await returnsRepository.createReturnOtp({
    tagCode,
    otpHash: hashReturnOtp(tagCode, otp),
    requestedByUserId: user.id,
  });

  await emailReturnCode({
    to: challenge.employeeEmail,
    employeeName: challenge.employeeName,
    otp,
    summary: `${user.name || user.email} of the General Services Office is recording the return of ${challenge.itemName} (${challenge.itemCode}, unit barcode ${challenge.tagCode}) from you.`,
    warning: 'Give this code to the GSO staff only if you are at the GSO counter returning this item right now. If you are not returning this item, do not share the code and report it to the General Services Office.',
  });

  return {
    challengeId: challenge.challengeId,
    expiresAt: challenge.expiresAt,
    sentTo: maskEmail(challenge.employeeEmail),
  };
}

// Emails the borrower a code bound to the quantity and condition GSO is about to record, so
// neither side can change the count later; a bulk return needs it.
async function sendBulkReturnOtp(input, user) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError(400, 'Hindi valid ang return code request.');
  }
  const issuanceId = readId(input.issuanceId, 'issued item record');
  const { lines, total, breakdown } = readReturnLines(input);
  requireMailTransport('Ipaayos muna sa IT Admin ang email settings.');
  const otp = newReturnOtp();
  const challenge = await returnsRepository.createBulkReturnOtp({
    issuanceId,
    quantity: total,
    condition: breakdown,
    otpHash: hashBulkReturnOtp(issuanceId, otp),
    requestedByUserId: user.id,
  });
  const unit = challenge.unitOfMeasure;
  const summaryParts = lines.map((line) => (line.condition === 'Lost'
    ? `${line.quantity} ${unit} reported lost`
    : `${line.quantity} ${unit} returned in ${line.condition} condition`));

  await emailReturnCode({
    to: challenge.employeeEmail,
    employeeName: challenge.employeeName,
    otp,
    summary: `${user.name || user.email} of the General Services Office is recording ${summaryParts.join(', ')} of ${challenge.itemName} (${challenge.itemCode}) from you.`,
    warning: 'Give this code to the GSO staff only if these quantities and conditions are correct and the items are being returned to GSO right now. If not, do not share the code and report it to the General Services Office.',
  });

  return {
    challengeId: challenge.challengeId,
    expiresAt: challenge.expiresAt,
    sentTo: maskEmail(challenge.employeeEmail),
  };
}

// Repaired units go straight back to stock; writing units off needs IT Admin approval instead.
async function resolveReturnRepair(returnIdValue, input, user) {
  const returnId = readId(returnIdValue, 'return record');
  if (input?.outcome !== 'Repaired') {
    throw httpError(400, 'Ang write-off ay kailangang i-request at i-approve ng IT Admin.');
  }
  const note = typeof input.note === 'string' && input.note.trim() ? requiredText(input.note, 'repair notes', 1000) : '';
  return returnsRepository.resolveReturnRepair({ returnId, outcome: 'Repaired', note, userId: user.id });
}

// Waiving lets an employee off the hook, so IT Admin does it directly; paid and replaced
// settlements go through a GSO request that IT Admin approves.
async function updateReturnSettlement(returnIdValue, input, admin) {
  const returnId = readId(returnIdValue, 'return record');
  if (input?.status !== 'Waived') {
    throw httpError(400, 'Ang paid o replaced na settlement ay ire-request ng GSO at i-aapprove ng IT Admin.');
  }
  const note = requiredText(input.note, 'dahilan ng waiver', 1000);
  return returnsRepository.updateReturnSettlement({ returnId, status: 'Waived', note, userId: admin.id });
}

const approvalNoteLabels = {
  'Written Off': 'dahilan kung bakit hindi na maaayos ang item',
  Paid: 'OR number o detalye ng bayad',
  Replaced: 'detalye ng ipinalit na item',
};

async function requestReturnApproval(returnIdValue, input, user) {
  const returnId = readId(returnIdValue, 'return record');
  const action = input?.action;
  if (!approvalActions.includes(action)) throw httpError(400, 'Pumili ng write off, paid, o replaced.');
  const note = requiredText(input.note, approvalNoteLabels[action], 1000);
  return returnsRepository.requestReturnApproval({ returnId, action, note, userId: user.id });
}

async function decideApprovalRequest(returnIdValue, input, admin) {
  const returnId = readId(returnIdValue, 'return record');
  const decision = input?.decision;
  if (decision !== 'approve' && decision !== 'reject') throw httpError(400, 'Pumili ng approve o decline.');
  const note = decision === 'reject'
    ? requiredText(input.note, 'dahilan ng pag-decline', 1000)
    : typeof input.note === 'string' && input.note.trim() ? requiredText(input.note, 'approval notes', 1000) : '';
  return returnsRepository.decideApprovalRequest({ returnId, decision, note, userId: admin.id });
}

async function listApprovalRequests(user) {
  return returnsRepository.listApprovalRequests({ userId: user.id });
}

async function listHoldings(query) {
  const employeeCode = typeof query.employeeCode === 'string' && query.employeeCode.trim()
    ? requiredText(query.employeeCode, 'employee code', 40)
    : null;
  return returnsRepository.listHoldings({ employeeCode });
}

const issuanceStatusLabels = { Pending: 'Pending acknowledgment', Rejected: 'Rejected', Expired: 'Expired', 'Email Failed': 'Email failed' };

function readOptionalDate(value, label) {
  if (value === undefined || value === '') return null;
  // The round trip rejects dates like 2026-02-30 that the pattern alone lets through.
  const parsed = new Date(`${value}T00:00:00Z`);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw httpError(400, `Hindi valid ang ${label} date.`);
  }
  return value;
}

// Where an issuance stands now, from its own status and the returns recorded against it.
function issuanceRecordStatus({ issuanceStatus, issueBehavior, outQuantity, accountedQuantity, isOverdue, returnedQuantity, lostQuantity }) {
  if (issuanceStatusLabels[issuanceStatus]) return issuanceStatusLabels[issuanceStatus];
  if (issueBehavior === 'consumable') return 'Consumed';
  if (outQuantity > 0) {
    if (isOverdue) return 'Overdue';
    return accountedQuantity > 0 ? 'Partially returned' : 'Issued';
  }
  return lostQuantity > 0 && returnedQuantity === 0 ? 'Lost' : 'Returned';
}

async function listIssuanceRecords(query) {
  const from = readOptionalDate(query.from, '"From"');
  const to = readOptionalDate(query.to, '"To"');
  if (from && to && from > to) throw httpError(400, 'Dapat mas maaga o kapareho ng "To" date ang "From" date.');
  const [issued, declined] = await Promise.all([
    returnsRepository.listIssuanceRecords({ from, to, limit: 1000 }),
    returnsRepository.listDeclinedPurchaseRecords({ from, to, limit: 1000 }),
  ]);
  // Newest first across both sources; the list stays capped at 1000 rows.
  const sortKey = (row) => new Date(row.decidedAt || row.requestedAt).getTime();
  const rows = [...issued, ...declined].sort((first, second) => sortKey(second) - sortKey(first)).slice(0, 1000);
  return rows.map(({ isPastDue, ...row }) => {
    const unitsWith = (status) => row.returns.filter((entry) => entry.status === status).reduce((sum, entry) => sum + entry.quantity, 0);
    const isActive = row.issuanceStatus === 'Issued' || row.issuanceStatus === 'Returned';
    const outQuantity = isActive && row.issueBehavior === 'returnable' ? row.quantity - row.accountedQuantity : 0;
    const record = {
      ...row,
      returnedQuantity: unitsWith('Returned'),
      lostQuantity: unitsWith('Lost'),
      outQuantity,
      isOverdue: outQuantity > 0 && isPastDue,
    };
    return { ...record, status: issuanceRecordStatus(record) };
  });
}

// Emails employees whose reusable-stock borrowing is past due, once a day each.
async function sendOverdueReminders() {
  if (!mailTransport) return 0;
  const batches = await returnsRepository.claimOverdueReminders(10);
  for (const batch of batches) {
    const itemLines = batch.items.map((item) => `${item.outstanding} ${item.unitOfMeasure} of ${item.itemName} (${item.itemCode})`);
    try {
      await mailTransport.sendMail({
        from: env.smtp.from,
        to: batch.email,
        subject: 'Reminder: borrowed GSO items are overdue',
        text: [
          `Dear ${batch.employeeName},`,
          '',
          `The items you borrowed from the General Services Office were due on ${formatManilaDateTime(batch.dueAt)}:`,
          ...itemLines.map((line) => `- ${line}`),
          '',
          'Please return them to the GSO office as soon as possible. New issuances to you are on hold until they are returned.',
          'If you already returned them, contact the General Services Office.',
          '',
          'General Services Office',
        ].join('\n'),
        html: [
          '<div style="margin:0;background:#f1f5f9;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a">',
          '<div style="max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:18px;background:#ffffff;padding:32px">',
          '<div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#2563eb">A.SSET | GSO</div>',
          '<h1 style="margin:16px 0 8px;font-size:22px">Borrowed items are overdue</h1>',
          `<p style="margin:0 0 16px;color:#475569">Dear ${escapeHtml(batch.employeeName)}, the items you borrowed were due on <strong>${escapeHtml(formatManilaDateTime(batch.dueAt))}</strong>:</p>`,
          `<ul style="margin:0 0 16px;color:#334155">${itemLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`,
          '<p style="margin:0;padding:12px 14px;border-radius:10px;background:#fef3c7;color:#92400e;font-weight:700">Please return them to the GSO office as soon as possible. New issuances to you are on hold until they are returned.</p>',
          '</div>',
          '</div>',
        ].join(''),
      });
    } catch (error) {
      // The batch stays marked as reminded, so the next attempt is tomorrow.
      console.error('Overdue reminder email could not be delivered.', { code: error.code, responseCode: error.responseCode });
    }
  }
  return batches.length;
}

async function completeTaggedAssetRepair(tagCodeValue, user) {
  if (typeof tagCodeValue !== 'string' || !/^AST-(?:[A-Z0-9]{13}|[A-F0-9]{20})$/i.test(tagCodeValue.trim())) {
    throw httpError(400, 'I-scan ang unique barcode ng physical unit bago markahang repaired.');
  }
  return returnsRepository.completeTaggedAssetRepair({
    tagCode: tagCodeValue.trim().toUpperCase(),
    changedByUserId: user.id,
  });
}

async function lookupReturnApproval(tokenValue) {
  const token = validateToken(tokenValue);
  const request = await returnsRepository.lookupReturnApproval(hashToken(token));
  if (!request) throw httpError(404, 'Hindi valid o wala na ang return approval link.');
  return request;
}

async function decideReturnApproval(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError(400, 'Hindi valid ang return approval decision.');
  }
  const token = validateToken(input.token);
  if (input.action !== 'approve' && input.action !== 'reject') {
    throw httpError(400, 'Pumili ng approve o reject.');
  }

  const result = await returnsRepository.resolveReturnApproval({ tokenHash: hashToken(token), action: input.action });
  if (result.notFound) throw httpError(404, 'Hindi valid o wala na ang return approval link.');
  if (result.expired) throw httpError(410, 'Nag-expire na ang return approval link. Nanatiling issued ang item.');
  if (result.alreadyDecided) {
    return {
      status: result.status,
      employeeName: result.employeeName,
      itemName: result.itemName,
      alreadyDecided: true,
    };
  }
  return result;
}

async function expirePendingReturns() {
  return returnsRepository.expirePendingReturns();
}

module.exports = {
  createEmployeeReturn,
  sendBulkReturnOtp,
  sendTaggedReturnOtp,
  confirmScannedTagReturn,
  resolveReturnRepair,
  updateReturnSettlement,
  requestReturnApproval,
  decideApprovalRequest,
  listApprovalRequests,
  listHoldings,
  listIssuanceRecords,
  sendOverdueReminders,
  completeTaggedAssetRepair,
  lookupReturnApproval,
  decideReturnApproval,
  expirePendingReturns,
};
