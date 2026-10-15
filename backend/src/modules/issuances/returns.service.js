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

async function createEmployeeReturn(input, user) {
  const { employeeCode, itemCode, condition, reason } = validateCreateReturn(input);
  const token = crypto.randomBytes(32).toString('base64url');
  const returned = await returnsRepository.confirmReturnByGso({
    employeeCode,
    itemCode,
    condition,
    reason,
    tokenHash: hashToken(token),
    requestedByUserId: user.id,
  });

  const employeeName = escapeHtml(returned.employee_name);
  const itemName = escapeHtml(returned.description);
  const safeItemCode = escapeHtml(returned.item_code);
  const safeCondition = escapeHtml(condition);
  const safeReason = escapeHtml(reason);
  let emailSent = false;

  if (mailTransport) {
    try {
      await mailTransport.sendMail({
        from: env.smtp.from,
        to: returned.employee_email,
        subject: 'Thank you for returning your equipment',
        text: [
          'Dear ' + returned.employee_name + ',',
          '',
          'Thank you for returning ' + returned.description + ' (' + returned.item_code + ') to the General Services Office.',
          'Return condition recorded by GSO: ' + condition,
          'GSO notes: ' + reason,
          '',
          'We appreciate your cooperation and your care for the school equipment.',
          '',
          'With appreciation,',
          'General Services Office',
        ].join('\n'),
        html: [
          '<div style="margin:0;background:#f1f5f9;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a">',
          '<div style="max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:18px;background:#ffffff;padding:32px">',
          '<div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#2563eb">A.SSET | GSO</div>',
          '<h1 style="margin:16px 0 8px;font-size:22px">Thank you for returning your equipment</h1>',
          '<p style="margin:0 0 24px;color:#475569">Dear ' + employeeName + ', thank you for your cooperation with the equipment return.</p>',
          '<div style="border:1px solid #e2e8f0;border-radius:12px;padding:18px">',
          '<div style="font-size:16px;font-weight:700">' + itemName + '</div>',
          '<div style="margin-top:6px;color:#64748b">Asset code: ' + safeItemCode + '</div>',
          '<div style="margin-top:12px;color:#334155">Return condition recorded by GSO: <strong>' + safeCondition + '</strong></div>',
          '<div style="margin-top:8px;color:#334155">GSO notes: ' + safeReason + '</div>',
          '</div>',
          '<p style="margin:24px 0 8px;color:#475569">We appreciate your care for the school equipment and your help in keeping our inventory records accurate.</p>',
          '<p style="margin:20px 0 0;color:#475569">With appreciation,<br><strong>General Services Office</strong></p>',
          '</div>',
          '</div>',
        ].join(''),
      });
      emailSent = true;
      try {
        await returnsRepository.markReturnEmailSent(returned.id);
      } catch {
        console.error('Return appreciation email was sent, but its sent time could not be recorded.');
      }
    } catch (error) {
      console.error('Employee return appreciation email could not be delivered.', {
        code: error.code,
        responseCode: error.responseCode,
        command: error.command,
      });
    }
  }

  return {
    id: returned.id,
    status: returned.status,
    employeeCode: returned.employee_code,
    employeeName: returned.employee_name,
    employeeEmail: returned.employee_email,
    itemCode: returned.item_code,
    itemName: returned.description,
    condition,
    reason,
    requestedAt: returned.requestedAt,
    emailSent,
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
