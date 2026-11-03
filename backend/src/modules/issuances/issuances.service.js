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
  const quantity = Number(input.quantity ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2147483647) {
    throw httpError(400, 'Ang quantity na hihiramin ay dapat whole number na hindi bababa sa 1.');
  }
  const notes = requiredText(input.notes, 'issuance notes', 1000, { optional: true });
  return { employeeCode, itemId, quantity, notes };
}

function validateCreateIssuanceBatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError(400, 'Hindi valid ang issuance request.');
  }
  const employeeCode = requiredText(input.employeeCode, 'employee code', 40);
  const usesDetailedItems = Array.isArray(input.items);
  const requestedItems = usesDetailedItems
    ? input.items
    : Array.isArray(input.itemIds)
      ? input.itemIds.map((itemId) => ({ itemId, quantity: 1 }))
      : null;
  if (!requestedItems || requestedItems.length < 1 || requestedItems.length > 100) {
    throw httpError(400, 'Pumili ng 1 hanggang 100 inventory item.');
  }
  const items = requestedItems.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw httpError(400, 'May hindi valid na inventory item sa request.');
    }
    const rawItemId = value.itemId;
    if (typeof rawItemId !== 'string' && typeof rawItemId !== 'number') {
      throw httpError(400, 'May hindi valid na inventory item sa request.');
    }
    const itemId = String(rawItemId);
    if (!/^\d{1,20}$/.test(itemId)) throw httpError(400, 'May hindi valid na inventory item sa request.');
    const quantity = Number(value.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2147483647) {
      throw httpError(400, 'Ang quantity ng bawat item ay dapat whole number na hindi bababa sa 1.');
    }
    return { itemId, quantity };
  });
  const itemIds = items.map((item) => item.itemId);
  if (new Set(itemIds).size !== itemIds.length) {
    throw httpError(400, 'May nadobleng inventory item sa request.');
  }
  const notes = requiredText(input.notes, 'issuance notes', 1000, { optional: true });
  return { employeeCode, items, notes };
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

async function createIssuance(input, user) {
  const { employeeCode, itemId, quantity, notes } = validateCreateIssuance(input);
  const batch = await createIssuanceBatch({
    employeeCode,
    items: [{ itemId, quantity }],
    notes,
  }, user);
  const item = batch.items[0];
  return {
    id: item.id,
    status: batch.status,
    employeeCode: batch.employeeCode,
    employeeName: batch.employeeName,
    employeeEmail: batch.employeeEmail,
    itemCode: item.itemCode,
    itemName: item.itemName,
    condition: item.condition,
    quantity: item.quantity,
    unitOfMeasure: item.unitOfMeasure,
    notes,
    requestedAt: batch.requestedAt,
    expiresAt: batch.expiresAt,
  };
}
async function createIssuanceBatch(input, user) {
  if (!mailTransport) {
    throw httpError(503, 'Hindi available ang issuance email. I-configure muna ang SMTP sa backend/.env.', true);
  }

  const { employeeCode, items, notes } = validateCreateIssuanceBatch(input);
  const token = crypto.randomBytes(32).toString('base64url');
  const batch = await issuancesRepository.createPendingIssuanceBatch({
    employeeCode,
    items,
    notes,
    tokenHash: hashToken(token),
    requestedByUserId: user.id,
  });
  const dashboardLink = new URL('/requester', env.frontendOrigin).toString();
  const employeeName = escapeHtml(batch.employee_name);
  const note = escapeHtml(notes || 'No additional notes.');
  const textItems = batch.items.map((item, index) =>
    `${index + 1}. ${item.itemName} (${item.itemCode})\n   Quantity: ${item.quantity} ${item.unitOfMeasure}\n   Condition: ${item.condition}`
  );
  const htmlItems = batch.items.map((item) => `
    <li style="margin:0 0 12px">
      <strong>${escapeHtml(item.itemName)}</strong>
      <div style="margin-top:4px;color:#64748b">Asset code: ${escapeHtml(item.itemCode)}</div>
      <div style="margin-top:4px;color:#334155">Quantity: <strong>${item.quantity} ${escapeHtml(item.unitOfMeasure)}</strong></div>
      <div style="margin-top:4px;color:#334155">Condition: <strong>${escapeHtml(item.condition)}</strong></div>
    </li>`).join('');

  try {
    await mailTransport.sendMail({
      from: env.smtp.from,
      to: batch.employee_email,
      subject: `New equipment issuance notification (${batch.items.length} item${batch.items.length === 1 ? '' : 's'})`,
      text: [
        `Hello ${batch.employee_name},`,
        '',
        `GSO prepared an issuance request for these ${batch.items.length} item${batch.items.length === 1 ? '' : 's'}:`,
        ...textItems,
        `Notes: ${notes || 'No additional notes.'}`,
        '',
        `Sign in to the A.S.SET Requester Dashboard to approve or reject this request: ${dashboardLink}`,
        'After you approve it in the dashboard, GSO will generate a unique barcode for each physical unit.',
      ].join('\n'),
      html: `
        <div style="margin:0;background:#f1f5f9;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a">
          <div style="max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:18px;background:#ffffff;padding:32px">
            <div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#2563eb">A.SSET - GSO</div>
            <h1 style="margin:16px 0 8px;font-size:22px">New equipment issuance</h1>
            <p style="margin:0 0 24px;color:#475569">Hello ${employeeName}, GSO prepared the following issuance request for you.</p>
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:18px">
              <div style="margin-bottom:14px;font-size:16px;font-weight:700">Items requested (${batch.items.length})</div>
              <ul style="margin:0;padding-left:20px">${htmlItems}</ul>
              <div style="margin-top:16px;color:#334155">GSO notes: ${note}</div>
            </div>
            <p style="margin:24px 0 14px;color:#475569">Review and approve or reject this request after signing in to your A.S.SET account. No decision is made from this email.</p>
            <a href="${dashboardLink}" style="display:inline-block;margin:0 8px 8px 0;border-radius:9px;background:#2563eb;padding:12px 20px;color:#ffffff;font-weight:700;text-decoration:none">Open Requester Dashboard</a>
            <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#64748b">After approval in the dashboard, GSO will generate a unique barcode for each physical unit in this request.</p>
          </div>
        </div>`,
    });
  } catch (error) {
    try {
      await issuancesRepository.markBatchEmailFailed(batch.id);
    } catch {
      console.error('Issuance batch email failed and the pending items could not be released.');
    }
    console.error('Employee issuance batch email could not be delivered.', {
      code: error.code,
      responseCode: error.responseCode,
      command: error.command,
    });
    throw httpError(503, 'Hindi naipadala ang issuance notification email. Naibalik sa Available ang mga item; pakisuri ang Gmail SMTP App Password sa backend/.env at subukan muli.', true);
  }

  try {
    await issuancesRepository.markBatchEmailSent(batch.id);
  } catch (error) {
    console.error('Issuance batch email was delivered, but its sent timestamp could not be saved.', {
      message: error.message,
    });
  }

  return {
    id: batch.id,
    status: batch.status,
    employeeCode: batch.employee_code,
    employeeName: batch.employee_name,
    employeeEmail: batch.employee_email,
    items: batch.items,
    notes,
    requestedAt: batch.requestedAt,
    expiresAt: batch.expiresAt,
  };
}

async function listEmployeeIssuances(employeeCodeValue) {
  const employeeCode = requiredText(employeeCodeValue, 'employee code', 40);
  return issuancesRepository.listEmployeeIssuances(employeeCode);
}

async function listMyPendingIssuanceBatches(user) {
  return issuancesRepository.listMyPendingIssuanceBatches(user.id);
}

async function getIssuanceBatch(batchIdValue) {
  const batchId = requiredText(String(batchIdValue ?? ''), 'issuance request ID', 20);
  if (!/^\d{1,20}$/.test(batchId) || batchId === '0') {
    throw httpError(400, 'Hindi valid ang issuance request ID.');
  }
  return issuancesRepository.getIssuanceBatch(batchId);
}

async function listApprovedIssuanceBatches() {
  return issuancesRepository.listApprovedIssuanceBatches();
}

function normalizeAssetScanCode(value) {
  const tagCode = requiredText(value, 'barcode', 40).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(tagCode)) throw httpError(400, 'Hindi valid ang barcode o inventory code.');
  return tagCode;
}

async function getAssetTag(tagCodeValue) {
  const tagCode = normalizeAssetScanCode(tagCodeValue);
  const tag = await issuancesRepository.getAssetTagByCode(tagCode);
  if (!tag) throw httpError(404, 'Walang item o barcode na tumutugma sa code na ito.');
  if (tag.barcodeNotGenerated) {
    throw httpError(409, `Wala pang unit barcode ang ${tag.itemCode}. Hintayin munang maaprubahan ang issuance.`);
  }
  if (tag.ambiguous) {
    throw httpError(409, `${tag.itemCode} ay may ${tag.unitCount} tagged units. I-scan ang unique AST- barcode sa mismong unit.`);
  }
  return tag;
}

async function inspectAssetTag(tagCodeValue, input, user) {
  const tagCode = normalizeAssetScanCode(tagCodeValue);
  if (!/^AST-(?:[A-Z0-9]{13}|[A-F0-9]{20})$/.test(tagCode)) throw httpError(400, 'I-scan ang unique barcode ng physical unit bago magtala ng inspection.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError(400, 'Hindi valid ang inspection record.');
  const allowedConditions = ['New', 'Good', 'Fair', 'Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired'];
  if (!allowedConditions.includes(input.condition)) throw httpError(400, 'Pumili ng valid na item condition.');
  const note = requiredText(input.note, 'inspection note', 1000);
  const tag = await issuancesRepository.updateAssetTagInspection({
    tagCode,
    condition: input.condition,
    note,
    changedByUserId: user.id,
  });
  if (!tag) throw httpError(404, 'Walang item na tumutugma sa barcode na ito.');
  return tag;
}

async function decideMyIssuanceBatch(batchIdValue, input, user) {
  const batchId = requiredText(String(batchIdValue ?? ''), 'issuance request ID', 20);
  if (!/^\d{1,20}$/.test(batchId) || batchId === '0') {
    throw httpError(400, 'Hindi valid ang issuance request ID.');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError(400, 'Hindi valid ang issuance decision.');
  }
  if (input.action !== 'approve' && input.action !== 'reject') {
    throw httpError(400, 'Pumili ng approve o reject.');
  }

  const result = await issuancesRepository.resolveApproval({
    batchId,
    requesterUserId: user.id,
    action: input.action,
  });
  if (result.notFound) throw httpError(404, 'Hindi makita ang pending issuance para sa verified employee account na ito.');
  if (result.expired) throw httpError(410, 'Nag-expire na ang issuance request at naibalik na sa available stock.');
  return result;
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

module.exports = {
  createIssuance,
  createIssuanceBatch,
  listEmployeeIssuances,
  listMyPendingIssuanceBatches,
  getIssuanceBatch,
  listApprovedIssuanceBatches,
  getAssetTag,
  inspectAssetTag,
  decideMyIssuanceBatch,
  lookupApproval,
  decideApproval,
  expirePendingIssuances,
};
