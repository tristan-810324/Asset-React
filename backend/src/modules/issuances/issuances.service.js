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
  let borrowDetails = null;
  if (input.borrowDetails !== undefined && input.borrowDetails !== null) {
    if (typeof input.borrowDetails !== 'object' || Array.isArray(input.borrowDetails)) {
      throw httpError(400, 'Hindi valid ang reusable-stock borrowing details.');
    }
    const useLocation = requiredText(input.borrowDetails.useLocation, 'place of use', 200);
    const purpose = requiredText(input.borrowDetails.purpose, 'event or borrowing purpose', 500);
    const isValidDate = (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    const hasUseAt = input.borrowDetails.useAt !== undefined && input.borrowDetails.useAt !== null && input.borrowDetails.useAt !== '';
    const hasReturnAt = input.borrowDetails.expectedReturnAt !== undefined && input.borrowDetails.expectedReturnAt !== null && input.borrowDetails.expectedReturnAt !== '';
    if (hasUseAt !== hasReturnAt) throw httpError(400, 'Ilagay ang petsa at oras ng hiraman at pagsoli.');

    let useDate;
    let expectedReturnDate;
    let useAt = null;
    let expectedReturnAt = null;
    if (hasUseAt) {
      const parseManilaDateTime = (value, label) => {
        const localValue = requiredText(value, label, 16);
        const match = localValue.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
        if (!match || !isValidDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59) {
          throw httpError(400, `Gumamit ng valid na petsa at oras para sa ${label}.`);
        }
        const instant = new Date(`${localValue}:00+08:00`);
        if (!Number.isFinite(instant.getTime())) throw httpError(400, `Gumamit ng valid na petsa at oras para sa ${label}.`);
        return { localValue, instant, databaseValue: instant.toISOString() };
      };
      const use = parseManilaDateTime(input.borrowDetails.useAt, 'hiraman');
      const expectedReturn = parseManilaDateTime(input.borrowDetails.expectedReturnAt, 'pagsoli');
      if (use.instant.getTime() < Date.now()) throw httpError(400, 'Ang petsa at oras ng hiraman ay hindi puwedeng nakaraan na.');
      if (expectedReturn.instant.getTime() <= use.instant.getTime()) {
        throw httpError(400, 'Ang inaasahang petsa at oras ng pagsoli ay dapat mas huli sa hiraman.');
      }
      useDate = use.localValue.slice(0, 10);
      expectedReturnDate = expectedReturn.localValue.slice(0, 10);
      useAt = use.databaseValue;
      expectedReturnAt = expectedReturn.databaseValue;
    } else {
      useDate = requiredText(input.borrowDetails.useDate, 'date of use', 10);
      expectedReturnDate = requiredText(input.borrowDetails.expectedReturnDate, 'expected return date', 10);
      if (!isValidDate(useDate) || !isValidDate(expectedReturnDate)) {
        throw httpError(400, 'Gumamit ng valid na petsa para sa paggamit at pagsoli.');
      }
      const manilaDateParts = Object.fromEntries(new Intl.DateTimeFormat('en', {
        timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(new Date()).map((part) => [part.type, part.value]));
      const todayInManila = `${manilaDateParts.year}-${manilaDateParts.month}-${manilaDateParts.day}`;
      if (useDate < todayInManila) throw httpError(400, 'Ang petsa ng paggamit ay hindi puwedeng nakaraan na.');
      if (expectedReturnDate < useDate) {
        throw httpError(400, 'Ang inaasahang petsa ng pagsoli ay dapat katumbas o mas huli sa petsa ng paggamit.');
      }
    }
    borrowDetails = { useDate, expectedReturnDate, useAt, expectedReturnAt, useLocation, purpose };
  }
  return { employeeCode, items, notes, borrowDetails };
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
    borrowDetails: input.borrowDetails,
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
  const { employeeCode, items, notes, borrowDetails } = validateCreateIssuanceBatch(input);
  const blockers = await issuancesRepository.getEmployeeReturnBlockers(employeeCode);
  if (blockers.overdue || blockers.unsettled) {
    const problems = [
      blockers.overdue ? `${blockers.overdue} overdue na hiniram na hindi pa naisasauli` : '',
      blockers.unsettled ? `${blockers.unsettled} nawalang item na hindi pa naaayos ang settlement` : '',
    ].filter(Boolean).join(' at ');
    throw httpError(409, `Hindi muna ma-issue-han si ${employeeCode}: may ${problems}. Ayusin muna ito sa Return Items.`);
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const batch = await issuancesRepository.createPendingIssuanceBatch({
    employeeCode,
    items,
    notes,
    borrowDetails,
    tokenHash: hashToken(token),
    requestedByUserId: user.id,
  });
  const employeeName = escapeHtml(batch.employee_name);
  const note = escapeHtml(notes || 'No additional notes.');
  const isConsumableDistribution = batch.items.every((item) => item.trackingMode === 'quantity' && item.issueBehavior === 'consumable');
  const isReusableBorrow = batch.items.every((item) => item.trackingMode === 'quantity' && item.issueBehavior === 'returnable');
  const subject = isConsumableDistribution
    ? 'GSO consumable stock issued'
    : isReusableBorrow
      ? 'GSO reusable-stock borrowing recorded'
      : 'Per-unit asset ready for handover';
  const employeeActionText = isConsumableDistribution
    ? 'GSO has issued this consumable stock. No approval or follow-up action is needed.'
    : isReusableBorrow
      ? 'GSO recorded your face-to-face borrowing. Return the borrowed items by the scheduled date and time.'
    : batch.requesterAccountLinked
      ? 'GSO reserved this per-unit asset for handover. Confirm receipt in your A.S.SET account only after you physically receive the unit.'
      : 'GSO reserved this per-unit asset for handover. After pickup, GSO will record the signed receipt or authorized handover for you.';
  const itemTypeLabel = (item) => item.trackingMode === 'individual'
    ? 'Per-unit asset'
    : item.issueBehavior === 'consumable' ? 'Consumable stock' : 'Reusable quantity stock';
  const textItems = batch.items.map((item, index) =>
    `${index + 1}. ${item.itemName} (${item.itemCode})\n   Type: ${itemTypeLabel(item)}\n   Quantity: ${item.quantity} ${item.unitOfMeasure}\n   Condition: ${item.condition}`
  );
  const borrowingDetailsText = batch.borrowDetails ? [
    '',
    'Face-to-face reusable-stock borrowing details:',
    `Borrow: ${batch.borrowDetails.useAt || batch.borrowDetails.useDate}`,
    `Return: ${batch.borrowDetails.expectedReturnAt || batch.borrowDetails.expectedReturnDate}`,
    `Event / purpose: ${batch.borrowDetails.purpose}`,
    `Location: ${batch.borrowDetails.useLocation}`,
  ] : [];
  const borrowingDetailsHtml = batch.borrowDetails ? `
    <div style="margin-top:16px;border-radius:10px;background:#fffbeb;padding:14px;color:#78350f">
      <div style="font-weight:700">Face-to-face reusable-stock borrowing</div>
      <div style="margin-top:6px">Borrow: <strong>${escapeHtml(batch.borrowDetails.useAt || batch.borrowDetails.useDate)}</strong></div>
      <div style="margin-top:4px">Return: <strong>${escapeHtml(batch.borrowDetails.expectedReturnAt || batch.borrowDetails.expectedReturnDate)}</strong></div>
      <div style="margin-top:4px">Event / purpose: <strong>${escapeHtml(batch.borrowDetails.purpose)}</strong></div>
      <div style="margin-top:4px">Location: <strong>${escapeHtml(batch.borrowDetails.useLocation)}</strong></div>
    </div>` : '';
  const htmlItems = batch.items.map((item) => `
    <li style="margin:0 0 12px">
      <strong>${escapeHtml(item.itemName)}</strong>
      <div style="margin-top:4px;color:#64748b">Asset code: ${escapeHtml(item.itemCode)}</div>
      <div style="margin-top:4px;color:#64748b">Type: ${escapeHtml(itemTypeLabel(item))}</div>
      <div style="margin-top:4px;color:#334155">Quantity: <strong>${item.quantity} ${escapeHtml(item.unitOfMeasure)}</strong></div>
      <div style="margin-top:4px;color:#334155">Condition: <strong>${escapeHtml(item.condition)}</strong></div>
    </li>`).join('');

  let emailSent = false;
  if (mailTransport) try {
    await mailTransport.sendMail({
      from: env.smtp.from,
      to: batch.employee_email,
      subject: `${subject} (${batch.items.length} item${batch.items.length === 1 ? '' : 's'})`,
      text: [
        `Hello ${batch.employee_name},`,
        '',
        `GSO recorded ${isConsumableDistribution ? 'a consumable distribution' : isReusableBorrow ? 'a face-to-face reusable-stock borrowing' : 'a per-unit asset handover'} for these ${batch.items.length} item${batch.items.length === 1 ? '' : 's'}:`,
        ...textItems,
        ...borrowingDetailsText,
        `Notes: ${notes || 'No additional notes.'}`,
        '',
        employeeActionText,
      ].join('\n'),
      html: `
        <div style="margin:0;background:#f1f5f9;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a">
          <div style="max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:18px;background:#ffffff;padding:32px">
            <div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#2563eb">A.SSET - GSO</div>
            <h1 style="margin:16px 0 8px;font-size:22px">${escapeHtml(subject)}</h1>
            <p style="margin:0 0 24px;color:#475569">Hello ${employeeName}, ${escapeHtml(employeeActionText)}</p>
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:18px">
              <div style="margin-bottom:14px;font-size:16px;font-weight:700">Items recorded (${batch.items.length})</div>
              <ul style="margin:0;padding-left:20px">${htmlItems}</ul>
              ${borrowingDetailsHtml}
              <div style="margin-top:16px;color:#334155">GSO notes: ${note}</div>
            </div>
            <p style="margin:24px 0 14px;color:#475569">${escapeHtml(employeeActionText)}</p>
          </div>
        </div>`,
    });
    emailSent = true;
  } catch (error) {
    console.error('Employee issuance batch email could not be delivered.', {
      code: error.code,
      responseCode: error.responseCode,
      command: error.command,
    });
  }

  if (emailSent) {
    try {
      await issuancesRepository.markBatchEmailSent(batch.id);
    } catch (error) {
      console.error('Issuance batch email was delivered, but its sent timestamp could not be saved.', {
        message: error.message,
      });
    }
  }

  return {
    id: batch.id,
    status: batch.status,
    employeeCode: batch.employee_code,
    employeeName: batch.employee_name,
    employeeEmail: batch.employee_email,
    requesterAccountLinked: batch.requesterAccountLinked,
    borrowDetails: batch.borrowDetails,
    items: batch.items,
    notes,
    requestedAt: batch.requestedAt,
    expiresAt: batch.expiresAt,
    emailSent,
  };
}

async function listEmployeeIssuances(employeeCodeValue) {
  const employeeCode = requiredText(employeeCodeValue, 'employee code', 40);
  return issuancesRepository.listEmployeeIssuances(employeeCode);
}

async function listMyPendingIssuanceBatches(user) {
  return issuancesRepository.listMyPendingIssuanceBatches(user.id);
}

async function listMyIssuanceActivity(user) {
  return issuancesRepository.listMyIssuanceActivity(user.id);
}

async function listMyDepartmentReturnActivity(user) {
  return issuancesRepository.listMyDepartmentReturnActivity(user.id);
}

async function getMyDepartmentIssuanceSummary(user) {
  return issuancesRepository.getMyDepartmentIssuanceSummary(user.id);
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
  if (tag.retiredLabel) {
    const retiredOn = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(tag.replacedAt));
    throw httpError(409, tag.kind === 'return'
      ? `Hindi na gumagana ang label na ito. Naibalik na ang ${tag.itemName} (${tag.itemCode}, unit ${tag.unitNumber}) noong ${retiredOn}. Tanggalin ang lumang label; bagong label ang ipi-print kapag na-issue ulit ang unit.`
      : `Luma na ang label na ito. Pinalitan ito noong ${retiredOn} ng label #${tag.labelVersion} para sa ${tag.itemName} (${tag.itemCode}, unit ${tag.unitNumber}). I-scan ang bagong label na nasa unit, at itapon ang lumang label.`);
  }
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
  if (input.action !== 'acknowledge') {
    throw httpError(400, 'Gamitin ang receipt acknowledgment pagkatapos aktuwal na matanggap ang item.');
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

async function recordIssuanceHandover(batchIdValue, input, user) {
  const batchId = requiredText(String(batchIdValue ?? ''), 'issuance request ID', 20);
  if (!/^\d{1,20}$/.test(batchId) || batchId === '0') {
    throw httpError(400, 'Hindi valid ang issuance request ID.');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError(400, 'Hindi valid ang handover record.');
  }
  const handoverMethod = input.method;
  if (!['signed_receipt', 'authorized_handover'].includes(handoverMethod)) {
    throw httpError(400, 'Pumili ng signed receipt o authorized handover.');
  }
  const handoverNote = requiredText(input.reference, 'receipt reference o pangalan ng authorized recipient', 200);
  const result = await issuancesRepository.resolveApproval({
    batchId,
    gsoUserId: user.id,
    action: 'acknowledge',
    handoverMethod,
    handoverNote,
  });
  if (result.notFound) throw httpError(404, 'Hindi makita ang pending per-unit handover.');
  if (result.expired) throw httpError(410, 'Nag-expire na ang handover record.');
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
  listMyIssuanceActivity,
  listMyDepartmentReturnActivity,
  getMyDepartmentIssuanceSummary,
  getIssuanceBatch,
  listApprovedIssuanceBatches,
  getAssetTag,
  inspectAssetTag,
  decideMyIssuanceBatch,
  recordIssuanceHandover,
  lookupApproval,
  decideApproval,
  expirePendingIssuances,
};
