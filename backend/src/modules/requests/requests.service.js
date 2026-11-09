const nodemailer = require('nodemailer');
const env = require('../../config/env');
const requestsRepository = require('./requests.repository');
const requesterIdentityRepository = require('../requester-identity/requester-identity.repository');
const { normalizeEmail } = require('../auth/auth.validation');
const { buildPurchaseRequisitionPdf } = require('./purchase-requisition-pdf');
const { STAFF_ROUTES } = require('./requisition-routing');
const notificationsRepository = require('../notifications/notifications.repository');
const { invalid, text, validateCreateRequest, validateRequestFilters, validateRequestId } = require('./requests.validation');

const mailTransport = env.smtp
  ? nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
  })
  : null;

const purchaseRequisitionStatuses = new Set([
  'Submitted', 'Under Review', 'Needs Information', 'Approved', 'Rejected', 'GSO Endorsed',
  'Finance Handoff Pending', 'Finance Handoff Failed', 'Sent to Finance', 'Completed',
]);

const requisitionCategoryAliases = {
  OFFICE_SUPPLIES: ['office_supplies'],
  OFFICE_EQUIPMENT: ['office_equipment'],
  MACHINERY_PARTS: ['machinery_parts', 'machineries_parts'],
  COMPUTER_PERIPHERALS: ['computer_parts_peripherals', 'computer_peripherals', 'peripherals_computer_parts'],
  TOOLS_EQUIPMENT: ['tools_equipment', 'tools_and_equipment'],
  ELECTRICAL_SUPPLIES: ['electrical_supplies'],
  OTHER_CONSUMABLES: ['other_consumables'],
  OTHER: ['other', 'others'],
  PUBLICATIONS: ['publications'],
};

function normalizeCatalogCategory(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function catalogCategoryMatches(category, catalogCategory) {
  return (requisitionCategoryAliases[category] || []).includes(normalizeCatalogCategory(catalogCategory));
}

async function notifyPurchaseRequester(request, status, note = '') {
  if (!request?.requesterId) return false;
  const declined = (request.purchaseLines || [])
    .filter((line) => line.routeStatus === 'REJECTED' && line.reviewNote)
    .map((line) => `${line.itemName}: ${line.reviewNote}`);
  const declinedText = declined.length ? ` Declined items: ${declined.join('; ')}.` : '';
  const messages = {
    'Needs Information': `GSO needs more information before continuing. Sign in to A.S.SET and reply to this requisition.${note ? ` Details: ${note}` : ''}`,
    Approved: `Your requested items are approved and reserved. GSO Staff will prepare the issuance; check My Requests for each item.${declinedText}`,
    Rejected: `The GSO Head declined this requisition.${declinedText}`,
    Completed: `Your requisition is complete. Check My Requests for each item.${declinedText}`,
    'GSO Endorsed': `The GSO Head approved buying the items that are not in stock. GSO will send the purchase request to Finance; items already in stock are prepared by GSO Staff.${declinedText}`,
    'Sent to Finance': 'The GSO Head sent this requisition to Finance. GSO Staff will buy the items and add them to GSO inventory; you will be told when they are ready for release.',
    'Stock Received': 'The purchased items are now in GSO inventory and reserved for you. GSO Staff will prepare the issuance.',
    'Delivery Undone': 'GSO Staff corrected a delivery record, so the purchased items are not ready yet. GSO will update you again.',
  };
  const message = messages[status];
  if (!message) return null;
  const eventKey = request.updatedAt ? new Date(request.updatedAt).getTime() : Date.now();
  const notificationTitles = {
    'Needs Information': 'GSO needs more information',
    Approved: 'Purchase requisition approved',
    Rejected: 'Purchase requisition declined',
    Completed: 'Purchase requisition completed',
    'GSO Endorsed': 'Purchase approved by GSO Head',
    'Sent to Finance': 'Purchase request sent to Finance',
    'Stock Received': 'Purchased items received by GSO',
    'Delivery Undone': 'Delivery record corrected',
  };
  try {
    await notificationsRepository.createUserNotification({
      userId: request.requesterId,
      type: 'PURCHASE_REQUISITION',
      title: notificationTitles[status] || 'Purchase requisition update',
      message: `${request.referenceNo}: ${message}`,
      href: `/requester/requests/${request.id}`,
      dedupeKey: `purchase-requester:${request.id}:${status}:${eventKey}`,
    });
  } catch (error) {
    console.error('Purchase requisition in-app notification to the requester could not be saved.', { code: error.code, referenceNo: request.referenceNo });
  }
  if (!mailTransport || !request.requesterEmail) return false;
  try {
    await mailTransport.sendMail({
      from: env.smtp.from,
      to: request.requesterEmail,
      subject: `Purchase requisition ${request.referenceNo}: ${status}`,
      text: [
        `Hello ${request.formData?.requesterName || request.requesterName},`,
        '',
        message,
        '',
        `Reference: ${request.referenceNo}`,
        `Department: ${request.formData?.departmentOrganization || '—'}`,
        '',
        'This is an automated message from A.S.SET. You can sign in to view the request history.',
      ].join('\n'),
    });
    return true;
  } catch (error) {
    console.error('Purchase requisition status email to the requester could not be delivered.', {
      code: error.code,
      responseCode: error.responseCode,
      command: error.command,
      referenceNo: request.referenceNo,
    });
    return false;
  }
}

async function notifyGsoStaffPurchase(request, stage) {
  const notifications = {
    endorsed: {
      title: 'Purchase requisition approved by GSO Head',
      message: `${request.referenceNo} is approved for purchase. The GSO Head will send it to Finance; you can buy the items after that.`,
    },
    sentToFinance: {
      title: 'Purchase sent to Finance: you can buy now',
      message: `${request.referenceNo}: the GSO Head sent the purchase to Finance. Collect the funds, buy the items, add them in Item Master Data, then link the delivery.`,
    },
  };
  const notification = notifications[stage];
  if (!notification) return;
  try {
    await notificationsRepository.createRoleNotification({
      roleKey: 'GSO_STAFF',
      type: 'PURCHASE_REQUISITION',
      ...notification,
      href: '/gso/purchase-requisitions',
      dedupeKey: `purchase-staff:${request.id}:${stage}:${request.updatedAt ? new Date(request.updatedAt).getTime() : Date.now()}`,
    });
  } catch (error) {
    console.error('Purchase requisition in-app notification to GSO Staff could not be saved.', { code: error.code, referenceNo: request.referenceNo });
  }
}

const transitions = {
  BORROWING: {
    Submitted: ['Under Review', 'Needs Information', 'Approved', 'Rejected'],
    'Under Review': ['Needs Information', 'Approved', 'Rejected'],
    'Needs Information': ['Under Review', 'Approved', 'Rejected'],
    Approved: ['Ready for Pickup'],
    'Ready for Pickup': ['Issued'],
    'Return Requested': ['Returned', 'For Repair'],
    'For Repair': ['Returned'],
    Returned: ['Closed'],
  },
  FACILITY_USE: {
    Submitted: ['Under Review', 'Needs Information', 'Approved', 'Rejected'],
    'Under Review': ['Needs Information', 'Approved', 'Rejected'],
    'Needs Information': ['Under Review', 'Approved', 'Rejected'],
    Approved: ['Completed', 'Closed'],
    Completed: ['Closed'],
  },
  JOB_REQUEST: {
    Submitted: ['Under Review', 'Needs Information', 'Approved', 'Rejected'],
    'Under Review': ['Needs Information', 'Approved', 'Rejected'],
    'Needs Information': ['Under Review', 'Approved', 'Rejected'],
    Approved: ['In Progress'],
    'In Progress': ['Completed'],
    Completed: ['Closed'],
  },
  // GSO approves, issues the item through Main Issuance, then marks the request Completed.
  ISSUANCE_REQUEST: {
    Submitted: ['Under Review', 'Needs Information', 'Approved', 'Rejected'],
    'Under Review': ['Needs Information', 'Approved', 'Rejected'],
    'Needs Information': ['Under Review', 'Approved', 'Rejected'],
    Approved: ['Completed', 'Closed'],
    Completed: ['Closed'],
  },
  LOSS_DAMAGE_REPORT: {
    Submitted: ['Under Review', 'Needs Information', 'Approved', 'Rejected'],
    'Under Review': ['Needs Information', 'Approved', 'Rejected'],
    'Needs Information': ['Under Review', 'Approved', 'Rejected'],
    Approved: ['In Progress', 'Completed', 'Closed'],
    'In Progress': ['Completed'],
    Completed: ['Closed'],
  },
};

const conditions = new Set(['New', 'Good', 'Fair', 'Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired']);
const repairConditions = new Set(['Needs Repair', 'Under Maintenance', 'Unserviceable']);

async function listAssets() {
  return requestsRepository.listAssets();
}

async function listPurchaseItemNames() {
  return requestsRepository.listPurchaseItemNames();
}

async function createRequest(input, user) {
  if (!(await requesterIdentityRepository.isVerified(user.id))) {
    invalid('Kumpletuhin ang requester identity profile at hintayin ang pag-verify ng GSO bago magsumite ng request.', 403);
  }
  const validated = validateCreateRequest(input);
  if (validated.requestType === 'PURCHASE_REQUISITION') {
    const itemNameIds = [...new Set(validated.formData.items
      .map((item) => item.itemNameId)
      .filter((itemNameId) => itemNameId !== null))];
    const managedItemNames = await requestsRepository.listPurchaseItemNamesByIds(itemNameIds);
    const managedNameById = new Map(managedItemNames.map((itemName) => [String(itemName.id), itemName]));
    validated.formData.items = validated.formData.items.map((item) => {
      if (item.itemNameId === null) return item;
      const managedName = managedNameById.get(String(item.itemNameId));
      if (!managedName || !catalogCategoryMatches(item.category, managedName.category)
        || managedName.name.trim().toLowerCase() !== item.itemName.trim().toLowerCase()) {
        invalid('Hindi tugma ang saved item name sa napiling category. Pumili muli sa listahan.');
      }
      return {
        ...item,
        itemName: managedName.name,
        managedItemCategory: managedName.category,
        approvalPolicy: managedName.approvalPolicy || 'GSO_HEAD',
        staffIssueMaxQuantity: managedName.staffIssueMaxQuantity == null ? null : Number(managedName.staffIssueMaxQuantity),
      };
    });
    const catalogIds = [...new Set(validated.formData.items
      .map((item) => item.catalogItemId)
      .filter((itemId) => itemId !== null))];
    const catalogItems = await requestsRepository.listCatalogItemsByIds(catalogIds);
    const catalogById = new Map(catalogItems.map((item) => [String(item.id), item]));
    validated.formData.items = validated.formData.items.map((item) => {
      if (item.catalogItemId === null) return item;
      const catalogItem = catalogById.get(String(item.catalogItemId));
      if (!catalogItem) invalid('Hindi na makita ang napiling Item Master Data record. I-refresh ang catalog at pumili muli.');
      if (!catalogCategoryMatches(item.category, catalogItem.category)
        || catalogItem.name.trim().toLowerCase() !== item.itemName.trim().toLowerCase()) {
        invalid('Hindi tugma ang napiling item sa requisition category. Pumili muli mula sa Item Master Data.');
      }
      return {
        ...item,
        itemName: catalogItem.name,
        catalogItemCode: catalogItem.itemCode,
        catalogCategory: catalogItem.category,
        approvalPolicy: catalogItem.approvalPolicy || 'GSO_HEAD',
        staffIssueMaxQuantity: catalogItem.staffIssueMaxQuantity == null ? null : Number(catalogItem.staffIssueMaxQuantity),
      };
    });
    const employee = await requesterIdentityRepository.getVerifiedEmployeeSummary(user.id);
    if (!employee) invalid('Hindi makita ang aktibong verified employee record. Makipag-ugnayan sa GSO.', 403);
    validated.formData = {
      ...validated.formData,
      departmentOrganization: employee.department,
      requesterEmployeeCode: employee.employeeCode,
      requesterName: employee.employeeName,
      requesterPosition: employee.position,
      requesterAttestedAt: new Date().toISOString(),
      items: validated.formData.items.map((item) => ({
        itemSource: item.catalogItemId !== null ? 'CATALOG' : item.itemNameId !== null ? 'MANAGED_NAME' : 'PROPOSED',
        quantity: item.quantity,
        category: item.category,
        catalogItemId: item.catalogItemId,
        itemNameId: item.itemNameId,
        catalogItemCode: item.catalogItemCode || null,
        catalogCategory: item.catalogCategory || item.managedItemCategory || null,
        approvalPolicy: item.approvalPolicy || 'GSO_HEAD',
        staffIssueMaxQuantity: item.staffIssueMaxQuantity || null,
        itemName: item.itemName,
        description: item.description,
      })),
    };
  }
  return requestsRepository.createRequest({ ...validated, userId: user.id });
}

async function listRequesterDepartmentStaff(user) {
  if (!(await requesterIdentityRepository.getVerifiedEmployeeSummary(user.id))) {
    invalid('Kumpletuhin ang requester identity profile at hintayin ang pag-verify ng GSO bago pumili ng staff.', 403);
  }
  return requesterIdentityRepository.listVerifiedDepartmentEmployees(user.id);
}

async function listMine(user) {
  return requestsRepository.listMine(user.id);
}

async function getMine(idValue, user) {
  const request = await requestsRepository.getMineById(validateRequestId(idValue), user.id);
  if (!request) invalid('Hindi makita ang request.', 404);
  return request;
}

async function cancelMine(idValue, user) {
  const id = validateRequestId(idValue);
  const current = await requestsRepository.getMineById(id, user.id);
  if (!current) invalid('Hindi makita ang request.', 404);
  const isUnissuedAutoApproval = current.requestType === 'PURCHASE_REQUISITION'
    && current.status === 'Approved'
    && Array.isArray(current.purchaseLines)
    && current.purchaseLines.every((line) => line.routeStatus === 'READY_FOR_STAFF' && Number(line.issuedQuantity || 0) === 0);
  if (!['Submitted', 'Needs Information'].includes(current.status) && !isUnissuedAutoApproval) {
    invalid('Hindi na maaaring kanselahin ang request sa kasalukuyang status.', 409);
  }
  return requestsRepository.changeMineStatus({
    id,
    userId: user.id,
    expectedStatus: current.status,
    status: 'Cancelled',
    note: 'Request cancelled by requester.',
  });
}

async function respondMine(idValue, input, user) {
  const id = validateRequestId(idValue);
  const current = await requestsRepository.getMineById(id, user.id);
  if (!current) invalid('Hindi makita ang request.', 404);
  if (current.status !== 'Needs Information') invalid('Maaaring magbigay ng dagdag na impormasyon kapag Needs Information ang status.', 409);
  const message = text(input?.message, 'response', 2000);
  return requestsRepository.respondToRequest({ id, userId: user.id, message });
}

async function requestReturn(idValue, user) {
  const id = validateRequestId(idValue);
  const current = await requestsRepository.getMineById(id, user.id);
  if (!current) invalid('Hindi makita ang request.', 404);
  if (current.requestType !== 'BORROWING' || current.status !== 'Issued') {
    invalid('Return request ay para lamang sa kasalukuyang issued na borrowing.', 409);
  }
  return requestsRepository.changeMineStatus({
    id,
    userId: user.id,
    expectedStatus: 'Issued',
    status: 'Return Requested',
    note: 'Requester asked GSO to confirm the physical return.',
  });
}

async function listAll(query) {
  return requestsRepository.listAll(validateRequestFilters(query));
}

async function listPurchaseRequisitions(query = {}) {
  const status = query.status ? text(query.status, 'status', 40) : '';
  const search = query.search ? text(query.search, 'search', 100) : '';
  if (status && !purchaseRequisitionStatuses.has(status)) invalid('Hindi valid ang purchase requisition status filter.');
  // Each item's route, reserved stock, and purchase quantity come from its purchase line.
  return requestsRepository.listPurchaseRequisitions({ status, search });
}

async function listStaffPurchaseRequisitions() {
  return requestsRepository.attachStaffStockChecks(await requestsRepository.listStaffPurchaseRequisitions());
}

async function staffReviewPurchaseRequisition(idValue, input, user) {
  const id = validateRequestId(idValue);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Hindi valid ang staff review.');
  if (!['ROUTE', 'NEEDS_INFORMATION'].includes(input.action)) invalid('Pumili kung iru-route ang mga item o hihingi ng detalye sa requester.');
  const note = text(input.note, 'Note', 2000, { optional: true });
  if (input.action === 'NEEDS_INFORMATION' && !note) invalid('Isulat kung anong detalye ang kailangan mula sa requester.');
  // The routes the staff member saw; the server checks stock again and refuses if any changed.
  const expectedRoutes = {};
  if (input.action === 'ROUTE') {
    if (!input.routes || typeof input.routes !== 'object' || Array.isArray(input.routes)) invalid('I-refresh ang requisition bago mag-route.');
    for (const [lineId, route] of Object.entries(input.routes)) {
      if (!/^\d{1,18}$/.test(lineId) || !STAFF_ROUTES.has(route)) invalid('Hindi valid ang item route. I-refresh ang requisition.');
      expectedRoutes[lineId] = route;
    }
  }
  const request = await requestsRepository.staffReviewPurchaseRequisition({
    id,
    action: input.action,
    note,
    expectedRoutes,
    changedBy: user.id,
  });
  const requesterNotified = ['Needs Information', 'Approved'].includes(request.status)
    ? await notifyPurchaseRequester(request, request.status, note)
    : null;
  return { request, requesterNotified };
}

function idOf(value, label) {
  const id = String(value ?? '');
  if (!/^\d{1,18}$/.test(id)) invalid(`Hindi valid ang ${label}. I-refresh ang page.`);
  return id;
}

// The requisition items that have a delivery waiting to be linked, with the inventory records that could fill them.
async function listAwaitingPurchaseDeliveries(query = {}) {
  const itemIds = query.itemIds ? String(query.itemIds).split(',').map((id) => idOf(id, 'inventory record')) : [];
  if (itemIds.length > 500) invalid('Masyadong maraming inventory record ang napili.');
  return requestsRepository.listAwaitingDeliveries({ itemIds });
}

// GSO Staff link what they bought (already added in Item Master Data) to the requests waiting for it.
async function recordPurchaseDeliveries(input, user) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Hindi valid ang delivery details.');
  if (!Array.isArray(input.deliveries) || input.deliveries.length === 0 || input.deliveries.length > 200) {
    invalid('Pumili ng kahit isang item na ili-link ang delivery.');
  }
  const seen = new Set();
  const deliveries = input.deliveries.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) invalid('Hindi valid ang delivery details.');
    const delivery = {
      lineId: idOf(entry.lineId, 'requested item'),
      itemId: idOf(entry.itemId, 'inventory record'),
      quantity: Number(entry.quantity),
      confirmSimilarName: entry.confirmSimilarName === true,
    };
    if (!Number.isInteger(delivery.quantity) || delivery.quantity < 1 || delivery.quantity > 100000) {
      invalid('Ang natanggap na quantity ay dapat whole number na hindi bababa sa 1.');
    }
    const key = `${delivery.lineId}:${delivery.itemId}`;
    if (seen.has(key)) invalid('May nadobleng delivery para sa iisang item at inventory record.');
    seen.add(key);
    return delivery;
  });
  // Optional extra detail: the delivery itself is the record that the purchase happened.
  const receiptReference = text(input.receiptReference, 'Resibo/invoice number', 120, { optional: true });
  const result = await requestsRepository.recordPurchaseDeliveries({ deliveries, receiptReference, changedBy: user.id });
  for (const request of result.requests) {
    if (result.approvedRequestIds.includes(String(request.id))) await notifyPurchaseRequester(request, 'Stock Received');
  }
  return result.requests;
}

async function undoPurchaseDelivery(idValue, receiptIdValue, user) {
  const result = await requestsRepository.undoPurchaseDelivery({
    id: validateRequestId(idValue),
    receiptId: idOf(receiptIdValue, 'delivery record'),
    changedBy: user.id,
  });
  // The requester was told the items were ready, so tell them when that is taken back.
  if (result.reopened) await notifyPurchaseRequester(result.request, 'Delivery Undone');
  return result.request;
}

async function getStaffPurchaseRequisitionForIssuance(idValue) {
  const request = await requestsRepository.getById(null, validateRequestId(idValue));
  if (!request || request.requestType !== 'PURCHASE_REQUISITION'
    || !request.purchaseLines?.some((line) => ['READY_FOR_STAFF', 'PARTIAL_STOCK', 'HANDOVER_PENDING', 'PARTIALLY_ISSUED'].includes(line.routeStatus))) {
    invalid('Walang item na naka-queue para sa GSO Staff issuance.', 404);
  }
  return request;
}

async function reviewPurchaseRequisition(idValue, input, user) {
  const id = validateRequestId(idValue);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Hindi valid ang purchase requisition decision.');
  if (!['DECIDE', 'NEEDS_INFORMATION'].includes(input.action)) invalid('Magpasya sa mga item o humingi ng detalye sa requester.');
  const note = text(input.note, 'Note', 2000, { optional: true });
  if (input.action === 'NEEDS_INFORMATION' && !note) invalid('Isulat kung anong detalye ang kailangan mula sa requester.');
  let decisions = [];
  if (input.action === 'DECIDE') {
    if (!Array.isArray(input.decisions) || input.decisions.length === 0 || input.decisions.length > 100) {
      invalid('Magpasya para sa bawat item na naghihintay ng approval.');
    }
    decisions = input.decisions.map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) invalid('Hindi valid ang item decision.');
      const lineId = String(entry.lineId ?? '');
      if (!/^\d{1,18}$/.test(lineId) || !['APPROVE', 'DECLINE'].includes(entry.decision)) invalid('Hindi valid ang item decision.');
      const lineNote = text(entry.note, 'Dahilan', 1000, { optional: true });
      if (entry.decision === 'DECLINE' && !lineNote) invalid('Ilagay ang dahilan sa bawat item na idedecline.');
      return { lineId, decision: entry.decision, note: lineNote };
    });
    if (new Set(decisions.map((decision) => decision.lineId)).size !== decisions.length) invalid('May nadobleng item decision.');
  }
  const request = await requestsRepository.reviewPurchaseRequisition({
    id,
    action: input.action,
    decisions,
    note,
    changedBy: user.id,
  });
  const requesterNotified = await notifyPurchaseRequester(request, request.status, note);
  if (request.status === 'GSO Endorsed') await notifyGsoStaffPurchase(request, 'endorsed');
  return { request, requesterNotified };
}

async function sendPurchaseRequisitionToFinance(idValue, input, user) {
  const id = validateRequestId(idValue);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Hindi valid ang Finance handoff request.');
  const financeEmail = normalizeEmail(input.financeEmail);
  if (!mailTransport) invalid('Hindi naka-configure ang GSO email service. I-configure muna ang SMTP bago magpadala sa Finance.', 503);

  const current = await requestsRepository.getById(null, id);
  if (!current) invalid('Hindi makita ang purchase requisition.', 404);
  const financeLines = (current.purchaseLines || []).filter((line) => Number(line.financeQuantity) > 0);
  if (financeLines.length === 0) invalid('Walang shortage na ie-endorse sa Finance. Ang mga item na may stock ay nasa GSO Staff issuance queue.', 409);
  const request = await requestsRepository.beginFinanceHandoff({ id, financeEmail, changedBy: user.id });
  const formData = request.formData || {};
  const financeItems = financeLines.map((line) => ({
    itemName: line.itemName,
    category: line.category,
    quantity: Number(line.financeQuantity),
    requestedQuantity: Number(line.requestedQuantity),
    stockAvailableQuantity: Number(line.reservedQuantity),
    description: line.specifications,
  }));
  const requestForFinance = { ...request, formData: { ...formData, items: financeItems } };
  const itemLines = financeItems.map((item, index) =>
    `${index + 1}. ${item.itemName || 'General item'}\n   Category: ${item.category || 'Not specified'}\n   Requested quantity: ${item.requestedQuantity}\n   Available and reserved from GSO stock: ${item.stockAvailableQuantity}\n   Finance purchase quantity: ${item.quantity}\n   Specifications: ${item.description}`
  ).join('\n');
  const textBody = [
    'Good day, Finance Team,',
    '',
    'The GSO Head has approved the following purchase requisition and sends it to Finance for the release of funds.',
    '',
    `Reference: ${request.referenceNo}`,
    `EmployeeHead/requester: ${formData.requesterName || request.requesterName}`,
    `Employee code: ${formData.requesterEmployeeCode || '—'}`,
    `Department: ${formData.departmentOrganization || '—'}`,
    `Position: ${formData.requesterPosition || '—'}`,
    `Date needed: ${formData.requiredDate || '—'}`,
    `Urgency: ${formData.urgency || 'Standard'}${formData.urgentReason ? ` - ${formData.urgentReason}` : ''}`,
    `Purpose: ${formData.purpose || '—'}`,
    '',
    'Requested items:',
    itemLines || 'No item details were recorded.',
    '',
    `Additional remarks: ${formData.remarks || 'None'}`,
    '',
    `Endorsed by: ${user.name} <${user.email}>`,
    `Endorsed at: ${request.gsoHeadEndorsedAt ? new Date(request.gsoHeadEndorsedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Recorded in A.S.SET'}`,
    '',
    'This requisition was sent from A.S.SET. Please release the funds to GSO so the items can be bought; GSO Staff record the purchase and the delivery in the system. Reply to this email if anything needs to change.',
  ].join('\n');

  let sent;
  try {
    sent = await mailTransport.sendMail({
      from: env.smtp.from,
      to: financeEmail,
      replyTo: user.email,
      subject: `Purchase requisition ${request.referenceNo} — GSO Head endorsement`,
      text: textBody,
      attachments: [{
        filename: `Purchase-Requisition-${request.referenceNo}.pdf`,
        contentType: 'application/pdf',
        content: buildPurchaseRequisitionPdf({ request: requestForFinance, endorsedBy: user.name, endorsedEmail: user.email }),
      }],
    });
  } catch (error) {
    await requestsRepository.failFinanceHandoff({ id, changedBy: user.id });
    console.error('Purchase requisition email to Finance could not be delivered.', {
      code: error.code,
      responseCode: error.responseCode,
      command: error.command,
    });
    invalid('Hindi naipadala ang email sa Finance. Naka-save ang requisition at maaari itong subukang ipadala muli.', 502);
  }

  const completedRequest = await requestsRepository.completeFinanceHandoff({ id, messageId: sent.messageId, changedBy: user.id });
  const requesterNotified = await notifyPurchaseRequester(completedRequest, 'Sent to Finance');
  await notifyGsoStaffPurchase(completedRequest, 'sentToFinance');
  return { request: completedRequest, requesterNotified };
}

async function getForGso(idValue) {
  const request = await requestsRepository.getById(null, validateRequestId(idValue));
  if (!request) invalid('Hindi makita ang request.', 404);
  if (request.requestType === 'PURCHASE_REQUISITION' && request.status !== 'Approved') invalid('Approved purchase requisitions lang ang nasa GSO Staff issuance queue.', 404);
  return request;
}

async function updateStatus(idValue, input, user) {
  const id = validateRequestId(idValue);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Hindi valid ang status update.');
  const status = text(input.status, 'status', 40);
  const note = text(input.note, 'review note', 2000, { optional: true });
  const current = await requestsRepository.getById(null, id);
  if (!current) invalid('Hindi makita ang request.', 404);
  if (current.requestType === 'PURCHASE_REQUISITION') {
    if (current.status !== 'Approved' || status !== 'Completed') invalid('Approved purchase requisitions lang ang maaaring markahang Completed pagkatapos ng issuance.', 403);
    if (!note) invalid('Ilagay ang issuance batch reference pagkatapos maitala ang issuance.');
  }
  const allowed = transitions[current.requestType]?.[current.status] || [];
  if (!allowed.includes(status)) invalid(`Hindi pinapayagan ang pagbabago mula ${current.status} papuntang ${status}.`, 409);
  if (['Rejected', 'Needs Information'].includes(status) && !note) invalid('Maglagay ng dahilan o impormasyong kailangan sa requestor.');

  let dueDate;
  if (status === 'Issued') {
    dueDate = text(input.dueDate || current.formData.returnDate, 'due date', 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) invalid('Hindi valid ang due date.');
    const [year, month, day] = dueDate.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) invalid('Hindi valid ang due date.');
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (dueDate < todayIso) invalid('Pumili ng due date na ngayon o sa hinaharap.');
  }
  const conditionOut = input.conditionOut || 'Good';
  let conditionIn = input.conditionIn || (status === 'For Repair' ? 'Needs Repair' : 'Good');
  if (!conditions.has(conditionOut) || !conditions.has(conditionIn)) invalid('Pumili ng valid na item condition.');

  // A return from the requester is inspected item by item; nothing defaults to Good, and damaged
  // items keep the request in For Repair so they are not lent out again.
  let conditionsIn = null;
  if (current.requestType === 'BORROWING' && current.status === 'Return Requested' && ['Returned', 'For Repair'].includes(status)) {
    const provided = input.conditionsIn && typeof input.conditionsIn === 'object' && !Array.isArray(input.conditionsIn)
      ? input.conditionsIn
      : {};
    conditionsIn = {};
    for (const asset of current.assets.filter((entry) => !entry.returnedAt)) {
      const condition = provided[String(asset.id)];
      if (!conditions.has(condition) || condition === 'Retired') {
        invalid(`Piliin ang condition ng ibinalik na ${asset.itemName || 'item'}.`);
      }
      conditionsIn[String(asset.id)] = condition;
    }
    const damaged = Object.values(conditionsIn).some((condition) => repairConditions.has(condition));
    if (damaged && status !== 'For Repair') invalid('May sirang item sa ibinalik, kaya For Repair ang piliin.', 409);
    if (!damaged && status === 'For Repair') invalid('Walang sirang item sa ibinalik, kaya Returned ang piliin.', 409);
    if (damaged && !note) invalid('Isulat sa review note kung ano ang sira.');
    conditionIn = null;
  }

  return requestsRepository.setStatus({
    id,
    expectedStatus: current.status,
    status,
    note,
    changedBy: user.id,
    dueDate,
    conditionOut,
    conditionIn,
    conditionsIn,
  });
}

module.exports = {
  listAssets,
  listPurchaseItemNames,
  createRequest,
  listRequesterDepartmentStaff,
  listMine,
  getMine,
  cancelMine,
  respondMine,
  requestReturn,
  listAll,
  listPurchaseRequisitions,
  listStaffPurchaseRequisitions,
  staffReviewPurchaseRequisition,
  getStaffPurchaseRequisitionForIssuance,
  listAwaitingPurchaseDeliveries,
  recordPurchaseDeliveries,
  undoPurchaseDelivery,
  reviewPurchaseRequisition,
  sendPurchaseRequisitionToFinance,
  getForGso,
  updateStatus,
};
