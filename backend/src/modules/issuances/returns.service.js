const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const env = require('../../config/env');
const returnsRepository = require('./returns.repository');

const returnConditions = new Set([
  'New',
  'Good',
  'Fair',
  'Needs Repair',
  'Under Maintenance',
  'Unserviceable',
  'Retired',
]);

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
  const condition = requiredText(input.condition, 'condition pagkatapos ng GSO inspection', 40);
  if (!returnConditions.has(condition)) {
    throw httpError(400, 'Pumili ng valid na condition pagkatapos ng GSO inspection.');
  }
  const reason = requiredText(input.reason, 'return reason o notes', 1000);
  return { employeeCode, itemCode, condition, reason };
}

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

function approvalUrl(token, action) {
  const url = new URL('/issuance-approval', env.frontendOrigin);
  url.searchParams.set('token', token);
  url.searchParams.set('action', action);
  url.searchParams.set('type', 'return');
  return url.toString();
}

async function createEmployeeReturn(input, user) {
  if (!mailTransport) {
    throw httpError(503, 'Hindi available ang return approval email. I-configure muna ang SMTP sa backend/.env.', true);
  }

  const { employeeCode, itemCode, condition, reason } = validateCreateReturn(input);
  const token = crypto.randomBytes(32).toString('base64url');
  const pending = await returnsRepository.createPendingReturn({
    employeeCode,
    itemCode,
    condition,
    reason,
    tokenHash: hashToken(token),
    requestedByUserId: user.id,
  });

  const approveLink = approvalUrl(token, 'approve');
  const rejectLink = approvalUrl(token, 'reject');
  const employeeName = escapeHtml(pending.employee_name);
  const itemName = escapeHtml(pending.description);
  const safeItemCode = escapeHtml(pending.item_code);
  const safeCondition = escapeHtml(condition);
  const safeReason = escapeHtml(reason);

  try {
    await mailTransport.sendMail({
      from: env.smtp.from,
      to: pending.employee_email,
      subject: 'Please review your equipment return request',
      text: [
        `Hello ${pending.employee_name},`,
        '',
        `GSO is requesting your confirmation to return ${pending.description} (${pending.item_code}).`,
        `Condition recorded by GSO after inspection: ${condition}`,
        `GSO notes: ${reason}`,
        '',
        `Confirm return: ${approveLink}`,
        `Reject return request: ${rejectLink}`,
        '',
        'The item will remain assigned to you unless you confirm this request. This one-time decision link expires in 24 hours.',
      ].join('\n'),
      html: `
        <div style="margin:0;background:#f1f5f9;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a">
          <div style="max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:18px;background:#ffffff;padding:32px">
            <div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#2563eb">A.SSET · GSO</div>
            <h1 style="margin:16px 0 8px;font-size:22px">Equipment return confirmation</h1>
            <p style="margin:0 0 24px;color:#475569">Hello ${employeeName}, GSO is requesting your confirmation for this item return.</p>
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:18px">
              <div style="font-size:16px;font-weight:700">${itemName}</div>
              <div style="margin-top:6px;color:#64748b">Asset code: ${safeItemCode}</div>
              <div style="margin-top:12px;color:#334155">Condition after GSO inspection: <strong>${safeCondition}</strong></div>
              <div style="margin-top:8px;color:#334155">GSO notes: ${safeReason}</div>
            </div>
            <p style="margin:24px 0 14px;color:#475569">Confirming completes the return and updates the inventory condition. Rejecting keeps the item assigned to you.</p>
            <a href="${approveLink}" style="display:inline-block;margin:0 8px 8px 0;border-radius:9px;background:#2563eb;padding:12px 20px;color:#ffffff;font-weight:700;text-decoration:none">Review return</a>
            <a href="${rejectLink}" style="display:inline-block;margin:0 8px 8px 0;border-radius:9px;border:1px solid #cbd5e1;padding:11px 20px;color:#334155;font-weight:700;text-decoration:none">Review rejection</a>
            <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#64748b">This private, one-time link expires in 24 hours. Your item stays assigned to you until you confirm the return.</p>
          </div>
        </div>`,
    });
    await returnsRepository.markReturnEmailSent(pending.id);
  } catch (error) {
    try {
      await returnsRepository.markReturnEmailFailed(pending.id);
    } catch {
      console.error('Return approval email failed and its pending request could not be released.');
    }
    console.error('Employee return approval email could not be delivered.', {
      code: error.code,
      responseCode: error.responseCode,
      command: error.command,
    });
    throw httpError(503, 'Hindi naipadala ang return approval email. Nanatiling issued ang item; pakisuri ang Gmail SMTP App Password sa backend/.env at subukan muli.', true);
  }

  return {
    id: pending.id,
    status: pending.status,
    employeeCode: pending.employee_code,
    employeeName: pending.employee_name,
    employeeEmail: pending.employee_email,
    itemCode: pending.item_code,
    itemName: pending.description,
    condition,
    reason,
    requestedAt: pending.requestedAt,
    expiresAt: pending.expiresAt,
  };
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

module.exports = { createEmployeeReturn, lookupReturnApproval, decideReturnApproval, expirePendingReturns };
