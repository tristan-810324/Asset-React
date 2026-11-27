const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const env = require('../../config/env');
const issuancesRepository = require('./issuances.repository');
const { groupIssuanceLines, describeCodes } = require('./issuance-summary');
const notificationsRepository = require('../notifications/notifications.repository');
const { escapeHtml, emailLayout, noticeBox } = require('../../lib/email-layout');

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
    throw httpError(400, `Enter the ${label}.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw httpError(400, `${label} must be ${maxLength} characters or less.`);
  }
  return trimmed;
}

function validateCreateIssuance(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError(400, 'Invalid issuance request.');
  }
  const employeeCode = requiredText(input.employeeCode, 'employee code', 40);
  if (typeof input.itemId !== 'string' && typeof input.itemId !== 'number') {
    throw httpError(400, 'Choose an item from inventory.');
  }
  const itemId = String(input.itemId);
  if (!/^\d{1,20}$/.test(itemId)) throw httpError(400, 'Invalid inventory item.');
  const quantity = Number(input.quantity ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2147483647) {
    throw httpError(400, 'The quantity to borrow must be a whole number of at least 1.');
  }
  const notes = requiredText(input.notes, 'issuance notes', 1000, { optional: true });
  return { employeeCode, itemId, quantity, notes };
}

function validateCreateIssuanceBatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError(400, 'Invalid issuance request.');
  }
  const employeeCode = requiredText(input.employeeCode, 'employee code', 40);
  const usesDetailedItems = Array.isArray(input.items);
  const requestedItems = usesDetailedItems
    ? input.items
    : Array.isArray(input.itemIds)
      ? input.itemIds.map((itemId) => ({ itemId, quantity: 1 }))
      : null;
  if (!requestedItems || requestedItems.length < 1 || requestedItems.length > 100) {
    throw httpError(400, 'Choose 1 to 100 inventory items.');
  }
  const items = requestedItems.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw httpError(400, 'The request has an invalid inventory item.');
    }
    const rawItemId = value.itemId;
    if (typeof rawItemId !== 'string' && typeof rawItemId !== 'number') {
      throw httpError(400, 'The request has an invalid inventory item.');
    }
    const itemId = String(rawItemId);
    if (!/^\d{1,20}$/.test(itemId)) throw httpError(400, 'The request has an invalid inventory item.');
    const quantity = Number(value.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2147483647) {
      throw httpError(400, 'The quantity of each item must be a whole number of at least 1.');
    }
    const rawLineId = value.purchaseRequisitionLineId;
    const purchaseRequisitionLineId = rawLineId === undefined || rawLineId === null || rawLineId === ''
      ? null
      : String(rawLineId);
    if (purchaseRequisitionLineId !== null && !/^\d{1,20}$/.test(purchaseRequisitionLineId)) {
      throw httpError(400, 'Invalid purchase requisition item reference.');
    }
    const rawRecipientAllocations = value.recipientAllocations;
    if (rawRecipientAllocations !== undefined && (!Array.isArray(rawRecipientAllocations) || rawRecipientAllocations.length > 100)) {
      throw httpError(400, 'Invalid planned employee allocation for the item.');
    }
    const recipientAllocations = (rawRecipientAllocations || []).map((allocation) => {
      if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation)) {
        throw httpError(400, 'The item has an invalid employee allocation.');
      }
      const recipientEmployeeCode = requiredText(allocation.employeeCode, 'recipient employee code', 40);
      const recipientQuantity = Number(allocation.quantity);
      if (!Number.isInteger(recipientQuantity) || recipientQuantity < 1 || recipientQuantity > quantity) {
        throw httpError(400, 'The recipient quantity must be a whole number, not more than the item quantity.');
      }
      return {
        employeeCode: recipientEmployeeCode,
        quantity: recipientQuantity,
        location: requiredText(allocation.location, 'actual use location', 200, { optional: true }),
        purpose: requiredText(allocation.purpose, 'recipient purpose', 500, { optional: true }),
      };
    });
    if (recipientAllocations.length > 0) {
      const headCode = employeeCode.toLowerCase();
      const recipientKeys = recipientAllocations.map((allocation) => {
        const recipientCode = allocation.employeeCode.toLowerCase();
        // Department room and stock allocations are intentionally held by the
        // requisition head. Allow more than one head allocation when each one
        // identifies a different actual location or purpose.
        if (recipientCode === headCode) {
          return `${recipientCode}|${allocation.location.toLowerCase()}|${allocation.purpose.toLowerCase()}`;
        }
        return recipientCode;
      });
      if (new Set(recipientKeys).size !== recipientKeys.length) {
        throw httpError(400, 'Put the same recipient and destination in one allocation row.');
      }
      if (recipientAllocations.reduce((sum, allocation) => sum + allocation.quantity, 0) !== quantity) {
        throw httpError(400, 'The total recipient allocation must match the issuance quantity exactly.');
      }
    }
    return { itemId, quantity, purchaseRequisitionLineId, recipientAllocations };
  });
  const itemIds = items.map((item) => item.itemId);
  if (new Set(itemIds).size !== itemIds.length) {
    throw httpError(400, 'The request has a duplicate inventory item.');
  }
  const notes = requiredText(input.notes, 'issuance notes', 1000, { optional: true });
  const purchaseRequisitionId = input.purchaseRequisitionId === undefined || input.purchaseRequisitionId === null || input.purchaseRequisitionId === ''
    ? null
    : String(input.purchaseRequisitionId);
  if (purchaseRequisitionId !== null && !/^\d{1,20}$/.test(purchaseRequisitionId)) throw httpError(400, 'Invalid purchase requisition reference.');
  if (purchaseRequisitionId && items.some((item) => !item.purchaseRequisitionLineId)) {
    throw httpError(400, 'Choose items from the assigned purchase requisition.');
  }
  let borrowDetails = null;
  if (input.borrowDetails !== undefined && input.borrowDetails !== null) {
    if (typeof input.borrowDetails !== 'object' || Array.isArray(input.borrowDetails)) {
      throw httpError(400, 'Invalid reusable-stock borrowing details.');
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
    if (hasUseAt !== hasReturnAt) throw httpError(400, 'Enter the borrow and return date and time.');

    let useDate;
    let expectedReturnDate;
    let useAt = null;
    let expectedReturnAt = null;
    if (hasUseAt) {
      const parseManilaDateTime = (value, label) => {
        const localValue = requiredText(value, label, 16);
        const match = localValue.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
        if (!match || !isValidDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59) {
          throw httpError(400, `Enter a valid date and time for ${label}.`);
        }
        const instant = new Date(`${localValue}:00+08:00`);
        if (!Number.isFinite(instant.getTime())) throw httpError(400, `Enter a valid date and time for ${label}.`);
        return { localValue, instant, databaseValue: instant.toISOString() };
      };
      const use = parseManilaDateTime(input.borrowDetails.useAt, 'hiraman');
      const expectedReturn = parseManilaDateTime(input.borrowDetails.expectedReturnAt, 'pagsoli');
      if (use.instant.getTime() < Date.now()) throw httpError(400, 'The borrow date and time cannot be in the past.');
      if (expectedReturn.instant.getTime() <= use.instant.getTime()) {
        throw httpError(400, 'The expected return date and time must be after the borrow.');
      }
      useDate = use.localValue.slice(0, 10);
      expectedReturnDate = expectedReturn.localValue.slice(0, 10);
      useAt = use.databaseValue;
      expectedReturnAt = expectedReturn.databaseValue;
    } else {
      useDate = requiredText(input.borrowDetails.useDate, 'date of use', 10);
      expectedReturnDate = requiredText(input.borrowDetails.expectedReturnDate, 'expected return date', 10);
      if (!isValidDate(useDate) || !isValidDate(expectedReturnDate)) {
        throw httpError(400, 'Enter a valid date for use and return.');
      }
      const manilaDateParts = Object.fromEntries(new Intl.DateTimeFormat('en', {
        timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(new Date()).map((part) => [part.type, part.value]));
      const todayInManila = `${manilaDateParts.year}-${manilaDateParts.month}-${manilaDateParts.day}`;
      if (useDate < todayInManila) throw httpError(400, 'The use date cannot be in the past.');
      if (expectedReturnDate < useDate) {
        throw httpError(400, 'The expected return date must be the same as or after the use date.');
      }
    }
    borrowDetails = { useDate, expectedReturnDate, useAt, expectedReturnAt, useLocation, purpose };
  }
  return { employeeCode, items, notes, borrowDetails, purchaseRequisitionId };
}

function validateToken(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{40,128}$/.test(value)) {
    throw httpError(400, 'This approval link is invalid or no longer exists.');
  }
  return value;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
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
// The requisition lines that were not issued, written the way the requester should read them in the email.
function declinedNoteText(rows) {
  if (!rows.length) return '';
  const list = rows.map((row) => `- ${row.itemName} × ${row.requestedQuantity}: ${row.reviewNote}`).join('\n');
  const text = `We are sorry. These items were not issued:\n${list}`;
  return text.length > 600 ? `${text.slice(0, 597)}...` : text;
}

async function createIssuanceBatch(input, user) {
  const { employeeCode, items, notes, borrowDetails, purchaseRequisitionId } = validateCreateIssuanceBatch(input);
  const shortfallNote = purchaseRequisitionId
    ? declinedNoteText(await issuancesRepository.listDeclinedRequisitionLines(purchaseRequisitionId))
    : '';
  const recipientCodes = [...new Set([
    employeeCode,
    ...items.flatMap((item) => item.recipientAllocations.map((allocation) => allocation.employeeCode)),
  ])];
  const recipientBlockers = await Promise.all(recipientCodes.map(async (recipientCode) => ({
    employeeCode: recipientCode,
    blockers: await issuancesRepository.getEmployeeReturnBlockers(recipientCode),
  })));
  for (const { employeeCode: recipientCode, blockers } of recipientBlockers) {
    // Unsettled lost items no longer block a new issuance; Finance settles them on its own.
    if (!blockers.overdue) continue
    const problems = `${blockers.overdue} overdue borrowed item(s) not yet returned`;
    throw httpError(409, `Cannot issue to ${recipientCode} yet: ${problems}. Fix this in Return Items first.`);
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const batch = await issuancesRepository.createPendingIssuanceBatch({
    employeeCode,
    items,
    notes,
    borrowDetails,
    purchaseRequisitionId,
    shortfallNote,
    tokenHash: hashToken(token),
    requestedByUserId: user.id,
  });
  const note = escapeHtml(notes || 'No additional notes.');
  const isConsumableDistribution = batch.items.every((item) => item.trackingMode === 'quantity' && item.issueBehavior === 'consumable');
  const isReusableBorrow = batch.items.every((item) => item.trackingMode === 'quantity' && item.issueBehavior === 'returnable');
  const needsDepartmentDistribution = Boolean(purchaseRequisitionId);
  const subject = isConsumableDistribution
    ? 'GSO consumable stock issued'
    : isReusableBorrow
      ? 'GSO reusable-stock borrowing recorded'
      : needsDepartmentDistribution ? 'GSO issuance with staff recipient assignments' : 'Individually tracked items ready for pickup';
  const employeeActionText = shortfallNote
    ? 'GSO has issued the items that were in stock. No approval is needed for them.'
    : isConsumableDistribution
    ? 'GSO has issued this consumable stock. No approval or follow-up action is needed.'
    : isReusableBorrow
      ? 'GSO recorded your face-to-face borrowing. Return the borrowed items by the scheduled date and time.'
      : needsDepartmentDistribution
        ? 'GSO recorded the intended staff recipient for each item. Use the printed recipient sheet when handing the physical items to your staff.'
    : 'GSO prepared these individually tracked items for pickup. Barcode labels are ready; no requester confirmation is required.';
  const itemTypeLabel = (item) => item.trackingMode === 'individual'
    ? 'Individually tracked item'
    : item.issueBehavior === 'consumable' ? 'Consumable stock' : 'Reusable quantity stock';
  // One line per item, recipient, and location (issuance-summary.js); the total counts pieces, not lines.
  const recordedLines = groupIssuanceLines(batch.items);
  const totalPieces = batch.items.reduce((sum, item) => sum + Number(item.quantity), 0);
  const textItems = recordedLines.map((line, index) => [
    `${index + 1}. ${line.itemName} × ${line.quantity} ${line.unitOfMeasure}`,
    `   Asset codes: ${describeCodes(line.codes)}`,
    `   Type: ${itemTypeLabel(line)}`,
    `   Condition: ${line.condition}`,
    `   Assigned to: ${line.recipientEmployeeName} (${line.recipientEmployeeCode})`,
    ...(line.recipientLocation ? [`   Use location: ${line.recipientLocation}`] : []),
    ...(line.recipientPurpose ? [`   Intended use: ${line.recipientPurpose}`] : []),
  ].join('\n'));
  const borrowingDetailsText = batch.borrowDetails ? [
    '',
    'Face-to-face reusable-stock borrowing details:',
    `Borrow: ${batch.borrowDetails.useAt || batch.borrowDetails.useDate}`,
    `Return: ${batch.borrowDetails.expectedReturnAt || batch.borrowDetails.expectedReturnDate}`,
    `Event / purpose: ${batch.borrowDetails.purpose}`,
    `Location: ${batch.borrowDetails.useLocation}`,
  ] : [];
  const borrowingDetailsHtml = batch.borrowDetails ? `
    <div style="margin-top:16px;border-radius:12px;background:#fffbeb;border:1px solid #fde68a;padding:14px 16px;color:#78350f;">
      <p style="margin:0;font-size:13px;font-weight:700;">Face-to-face reusable-stock borrowing</p>
      <p style="margin:6px 0 0;font-size:13px;">Borrow: <strong>${escapeHtml(batch.borrowDetails.useAt || batch.borrowDetails.useDate)}</strong></p>
      <p style="margin:4px 0 0;font-size:13px;">Return: <strong>${escapeHtml(batch.borrowDetails.expectedReturnAt || batch.borrowDetails.expectedReturnDate)}</strong></p>
      <p style="margin:4px 0 0;font-size:13px;">Event / purpose: <strong>${escapeHtml(batch.borrowDetails.purpose)}</strong></p>
      <p style="margin:4px 0 0;font-size:13px;">Location: <strong>${escapeHtml(batch.borrowDetails.useLocation)}</strong></p>
    </div>` : '';
  const lineRow = (label, value) => `<tr><td style="padding:3px 12px 3px 0;vertical-align:top;white-space:nowrap;color:#64748b;">${label}</td><td style="padding:3px 0;color:#0f172a;font-weight:600;">${value}</td></tr>`;
  const htmlItems = recordedLines.map((line) => `
    <div style="margin-bottom:10px;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;">
      <p style="margin:0;font-size:14px;font-weight:700;color:#0f172a;">${escapeHtml(line.itemName)} × ${line.quantity} ${escapeHtml(line.unitOfMeasure)}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:8px;font-size:13px;">
        ${lineRow('Asset codes', escapeHtml(describeCodes(line.codes)))}
        ${lineRow('Type', escapeHtml(itemTypeLabel(line)))}
        ${lineRow('Condition', escapeHtml(line.condition))}
        ${lineRow('Assigned to', `${escapeHtml(line.recipientEmployeeName)} (${escapeHtml(line.recipientEmployeeCode)})`)}
        ${line.recipientLocation ? lineRow('Use location', escapeHtml(line.recipientLocation)) : ''}
        ${line.recipientPurpose ? lineRow('Intended use', escapeHtml(line.recipientPurpose)) : ''}
      </table>
    </div>`).join('');

  let emailSent = false;
  if (mailTransport) try {
    await mailTransport.sendMail({
      from: env.smtp.from,
      to: batch.employee_email,
      subject: `${subject} (${totalPieces} item${totalPieces === 1 ? '' : 's'})`,
      text: [
        `Hello ${batch.employee_name},`,
        '',
        `GSO recorded ${isConsumableDistribution ? 'a consumable distribution' : isReusableBorrow ? 'a face-to-face reusable-stock borrowing' : needsDepartmentDistribution ? 'issuance with staff recipient assignments' : 'individually tracked items ready for pickup'} for these ${totalPieces} item${totalPieces === 1 ? '' : 's'}:`,
        ...textItems,
        ...borrowingDetailsText,
        ...(shortfallNote ? [shortfallNote, ''] : []),
        `Notes: ${notes || 'No additional notes.'}`,
        '',
        employeeActionText,
      ].join('\n'),
      html: emailLayout({
        title: subject,
        intro: `Hello ${batch.employee_name}, ${employeeActionText}`,
        body: `
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Items recorded (${totalPieces})</p>
          ${htmlItems}
          ${shortfallNote ? noticeBox(shortfallNote) : ''}
          ${borrowingDetailsHtml}
          <p style="margin:16px 0 0;font-size:13px;color:#334155;">GSO notes: <strong>${note}</strong></p>
          <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#475569;">${escapeHtml(employeeActionText)}</p>`,
      }),
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

  // The requester's own account sees the same batch in the app, so tell them there too.
  if (batch.requesterUserId) {
    const count = totalPieces;
    const needsConfirmation = batch.status === 'Pending';
    try {
      await notificationsRepository.createUserNotification({
        userId: batch.requesterUserId,
        type: 'ISSUANCE',
        title: needsConfirmation ? 'Items are waiting for your confirmation' : 'Items were issued to you',
        message: `${count} item${count === 1 ? '' : 's'} recorded for you. ${needsConfirmation
          ? 'Open My Issued Items and confirm once you have received them.'
          : 'No action is needed; the record is in My Issued Items.'}`,
        href: '/requester/issued-items',
        dedupeKey: `requester-issue:${batch.id}:${batch.status}`,
      });
    } catch (error) {
      console.error('Issuance notification to the requester could not be saved.', { code: error.code });
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
  await issuancesRepository.prepareLegacyPendingPickupBatches(user.id);
  return issuancesRepository.listMyPendingIssuanceBatches(user.id);
}

async function listMyIssuanceActivity(user) {
  await issuancesRepository.prepareLegacyPendingPickupBatches(user.id);
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
    throw httpError(400, 'Invalid issuance request ID.');
  }
  return issuancesRepository.getIssuanceBatch(batchId);
}

async function listApprovedIssuanceBatches() {
  return issuancesRepository.listApprovedIssuanceBatches();
}

function normalizeAssetScanCode(value) {
  const tagCode = requiredText(value, 'barcode', 40).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(tagCode)) throw httpError(400, 'Invalid barcode or inventory code.');
  return tagCode;
}

async function getAssetTag(tagCodeValue) {
  const tagCode = normalizeAssetScanCode(tagCodeValue);
  const tag = await issuancesRepository.getAssetTagByCode(tagCode);
  if (!tag) throw httpError(404, 'No item or barcode matches this code.');
  if (tag.retiredLabel) {
    const retiredOn = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(tag.replacedAt));
    throw httpError(409, tag.kind === 'return'
      ? `This label is no longer valid. The unit was returned on ${retiredOn}. Remove the old label.`
      : `This label is old. It was replaced on ${retiredOn}. Scan the new label on the unit and remove this one.`);
  }
  if (tag.barcodeNotGenerated) {
    throw httpError(409, `${tag.itemCode} has no unit barcode yet. Wait for the issuance to be approved.`);
  }
  if (tag.ambiguous) {
    throw httpError(409, `${tag.itemCode} has ${tag.unitCount} tagged units. Scan the unique AST- barcode on the unit itself.`);
  }
  return tag;
}

async function inspectAssetTag(tagCodeValue, input, user) {
  const tagCode = normalizeAssetScanCode(tagCodeValue);
  if (!/^AST-(?:[A-Z0-9]{13}|[A-F0-9]{20})$/.test(tagCode)) throw httpError(400, 'Scan the unique barcode of the physical unit before you record an inspection.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError(400, 'Invalid inspection record.');
  const allowedConditions = ['New', 'Good', 'Fair', 'Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired'];
  if (!allowedConditions.includes(input.condition)) throw httpError(400, 'Choose a valid item condition.');
  const note = requiredText(input.note, 'inspection note', 1000);
  const tag = await issuancesRepository.updateAssetTagInspection({
    tagCode,
    condition: input.condition,
    note,
    changedByUserId: user.id,
  });
  if (!tag) throw httpError(404, 'No item matches this barcode.');
  return tag;
}

async function decideMyIssuanceBatch(batchIdValue, input, user) {
  const batchId = requiredText(String(batchIdValue ?? ''), 'issuance request ID', 20);
  if (!/^\d{1,20}$/.test(batchId) || batchId === '0') {
    throw httpError(400, 'Invalid issuance request ID.');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError(400, 'Invalid issuance decision.');
  }
  if (input.action !== 'acknowledge') {
    throw httpError(400, 'Use the receipt acknowledgment after you actually receive the item.');
  }

  const result = await issuancesRepository.resolveApproval({
    batchId,
    requesterUserId: user.id,
    action: input.action,
  });
  if (result.notFound) throw httpError(404, 'No pending issuance was found for this verified employee account.');
  if (result.expired) throw httpError(410, 'The issuance request expired and went back to available stock.');
  await notificationsRepository.resolveByPrefix(`requester-issue:${batchId}:`).catch(() => undefined);
  // GSO Staff should know the requester received the items, so the batch is closed on their side too.
  await notificationsRepository.createRoleNotification({
    roleKey: 'GSO_STAFF',
    type: 'ISSUANCE',
    title: 'Requester confirmed receipt',
    message: `Issuance request #${batchId} was confirmed as received by the requester.`,
    href: '/gso/main-issuance',
    dedupeKey: `staff-issue-ack:${batchId}:${Date.now()}`,
  }).catch((error) => console.error('GSO Staff notice for requester receipt could not be saved.', { code: error.code }));
  return result;
}

async function recordIssuanceHandover(batchIdValue, input, user) {
  const batchId = requiredText(String(batchIdValue ?? ''), 'issuance request ID', 20);
  if (!/^\d{1,20}$/.test(batchId) || batchId === '0') {
    throw httpError(400, 'Invalid issuance request ID.');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError(400, 'Invalid handover record.');
  }
  const handoverMethod = input.method;
  if (!['signed_receipt', 'authorized_handover'].includes(handoverMethod)) {
    throw httpError(400, 'Choose a signed receipt or authorized handover.');
  }
  const handoverNote = requiredText(input.reference, 'receipt reference or authorized recipient name', 200);
  const result = await issuancesRepository.resolveApproval({
    batchId,
    gsoUserId: user.id,
    action: 'acknowledge',
    handoverMethod,
    handoverNote,
  });
  if (result.notFound) throw httpError(404, 'No pending item handover was found.');
  if (result.expired) throw httpError(410, 'The handover record expired.');
  await notificationsRepository.resolveByPrefix(`requester-issue:${batchId}:`).catch(() => undefined);
  return result;
}

async function lookupApproval(tokenValue) {
  const token = validateToken(tokenValue);
  const issuance = await issuancesRepository.lookupApproval(hashToken(token));
  if (!issuance) throw httpError(404, 'This approval link is invalid or no longer exists.');
  return issuance;
}

async function decideApproval(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError(400, 'Invalid approval decision.');
  }
  const token = validateToken(input.token);
  if (input.action !== 'approve' && input.action !== 'reject') {
    throw httpError(400, 'Choose approve or reject.');
  }

  const result = await issuancesRepository.resolveApproval({
    tokenHash: hashToken(token),
    action: input.action,
  });
  if (result.notFound) throw httpError(404, 'This approval link is invalid or no longer exists.');
  if (result.expired) throw httpError(410, 'The approval link expired. The inventory item went back to Available.');
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
