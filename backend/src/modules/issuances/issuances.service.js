const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const env = require('../../config/env');
const issuancesRepository = require('./issuances.repository');

const mailTransport = env.smtp
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    })
  : null;

function httpError(status, message, expose = status < 500) {
  return Object.assign(new Error(message), { status, expose });
}

function requiredText(value, label, maxLength, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim()) {
    throw httpError(400, `Pakilagay ang ${label}.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw httpError(400, `Hindi dapat lumampas sa ${maxLength} characters ang ${label}.`);
  }
  return trimmed;
}

function validateCreateIssuance(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError(400, 'Hindi valid ang issuance request.');
  }
  const employeeCode = requiredText(input.employeeCode, 'employee code', 40);
  if (typeof input.itemId !== 'string' && typeof input.itemId !== 'number') {
    throw httpError(400, 'Pumili ng item mula sa inventory.');
  }
  const itemId = String(input.itemId);
  if (!/^\d{1,20}$/.test(itemId)) throw httpError(400, 'Hindi valid ang inventory item.');
  const notes = requiredText(input.notes, 'issuance notes', 1000, { optional: true });
  return { employeeCode, itemId, notes };
}

function validateToken(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{40,128}$/.test(value)) {
    throw httpError(400, 'Hindi valid o wala na ang approval link.');
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

function approvalUrl(token, action) {
  const url = new URL('/issuance-approval', env.frontendOrigin);
  url.searchParams.set('token', token);
  url.searchParams.set('action', action);
  return url.toString();
}

async function createIssuance(input, user) {
  if (!mailTransport) {
    throw httpError(503, 'Hindi available ang issuance email. I-configure muna ang SMTP sa backend/.env.', true);
  }

  const { employeeCode, itemId, notes } = validateCreateIssuance(input);
  const token = crypto.randomBytes(32).toString('base64url');
  const pending = await issuancesRepository.createPendingIssuance({
    employeeCode,
    itemId,
    notes,
    tokenHash: hashToken(token),
    requestedByUserId: user.id,
  });

  const approveLink = approvalUrl(token, 'approve');
  const rejectLink = approvalUrl(token, 'reject');
  const employeeName = escapeHtml(pending.employee_name);
  const itemName = escapeHtml(pending.description);
  const itemCode = escapeHtml(pending.item_code);
  const condition = escapeHtml(pending.item_condition);
  const note = escapeHtml(notes || 'No additional notes.');

  try {
    await mailTransport.sendMail({
      from: env.smtp.from,
      to: pending.employee_email,
      subject: 'Please review your equipment issuance request',
      text: [
        `Hello ${pending.employee_name},`,
        '',
        `GSO is requesting your approval to issue ${pending.description} (${pending.item_code}) to you.`,
        `Condition: ${pending.item_condition}`,
        `Notes: ${notes || 'No additional notes.'}`,
        '',
        `Approve: ${approveLink}`,
        `Reject: ${rejectLink}`,
        '',
        'This one-time decision link expires in 24 hours. If you did not expect this request, choose Reject or contact GSO.',
      ].join('\n'),
      html: `
        <div style="margin:0;background:#f1f5f9;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a">
          <div style="max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:18px;background:#ffffff;padding:32px">
            <div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#2563eb">A.SSET · GSO</div>
            <h1 style="margin:16px 0 8px;font-size:22px">Equipment issuance approval</h1>
            <p style="margin:0 0 24px;color:#475569">Hello ${employeeName}, please review this request sent to your employee email.</p>
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:18px">
              <div style="font-size:16px;font-weight:700">${itemName}</div>
              <div style="margin-top:6px;color:#64748b">Asset code: ${itemCode}</div>
              <div style="margin-top:12px;color:#334155">Condition: <strong>${condition}</strong></div>
              <div style="margin-top:8px;color:#334155">GSO notes: ${note}</div>
            </div>
            <p style="margin:24px 0 14px;color:#475569">Choose an action. The link opens a confirmation page and will not change your record until you confirm.</p>
            <a href="${approveLink}" style="display:inline-block;margin:0 8px 8px 0;border-radius:9px;background:#2563eb;padding:12px 20px;color:#ffffff;font-weight:700;text-decoration:none">Review approval</a>
            <a href="${rejectLink}" style="display:inline-block;margin:0 8px 8px 0;border-radius:9px;border:1px solid #cbd5e1;padding:11px 20px;color:#334155;font-weight:700;text-decoration:none">Review rejection</a>
            <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#64748b">This private, one-time link expires in 24 hours. If you did not expect this request, choose Reject or contact GSO.</p>
          </div>
        </div>`,
    });
    await issuancesRepository.markEmailSent(pending.id);
  } catch (error) {
    try {
      await issuancesRepository.markEmailFailed(pending.id);
    } catch {
      console.error('Issuance email failed and the pending request could not be released.');
    }
    console.error('Employee issuance email could not be delivered.', {
      code: error.code,
      responseCode: error.responseCode,
      command: error.command,
    });
    throw httpError(503, 'Hindi naipadala ang approval email. Naibalik sa Available ang item; pakisuri ang Gmail SMTP App Password sa backend/.env at subukan muli.', true);
  }

  return {
    id: pending.id,
    status: pending.status,
    employeeCode: pending.employee_code,
    employeeName: pending.employee_name,
    employeeEmail: pending.employee_email,
    itemCode: pending.item_code,
    itemName: pending.description,
    condition: pending.item_condition,
    notes,
    requestedAt: pending.requestedAt,
    expiresAt: pending.expiresAt,
  };
}

async function listEmployeeIssuances(employeeCodeValue) {
  const employeeCode = requiredText(employeeCodeValue, 'employee code', 40);
  return issuancesRepository.listEmployeeIssuances(employeeCode);
}

async function lookupApproval(tokenValue) {
  const token = validateToken(tokenValue);
  const issuance = await issuancesRepository.lookupApproval(hashToken(token));
  if (!issuance) throw httpError(404, 'Hindi valid o wala na ang approval link.');
  return issuance;
}

async function decideApproval(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError(400, 'Hindi valid ang approval decision.');
  }
  const token = validateToken(input.token);
  if (input.action !== 'approve' && input.action !== 'reject') {
    throw httpError(400, 'Pumili ng approve o reject.');
  }

  const result = await issuancesRepository.resolveApproval({
    tokenHash: hashToken(token),
    action: input.action,
  });
  if (result.notFound) throw httpError(404, 'Hindi valid o wala na ang approval link.');
  if (result.expired) throw httpError(410, 'Nag-expire na ang approval link. Naibalik na sa Available ang inventory item.');
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

async function expirePendingIssuances() {
  return issuancesRepository.expirePendingIssuances();
}

module.exports = { createIssuance, listEmployeeIssuances, lookupApproval, decideApproval, expirePendingIssuances };
