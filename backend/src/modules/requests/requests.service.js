const nodemailer = require('nodemailer');
const env = require('../../config/env');
const requestsRepository = require('./requests.repository');
const requesterIdentityRepository = require('../requester-identity/requester-identity.repository');
const { normalizeEmail } = require('../auth/auth.validation');
const { buildPurchaseRequisitionPdf } = require('./purchase-requisition-pdf');
const { STAFF_ROUTES } = require('./requisition-routing');
const notificationsRepository = require('../notifications/notifications.repository');
const auditRepository = require('../audit/audit.repository');
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
    Approved: `The GSO Head approved the complete request. All requested items are reserved, so GSO Staff can prepare the full issuance.${declinedText}`,
    Rejected: `The GSO Head declined the complete requisition.${declinedText}`,
    Completed: `Your requisition is complete. Check My Requests for each item.${declinedText}`,
    'GSO Endorsed': 'The GSO Head approved the complete request. Only the shortage quantities will be sent to Finance; in-stock items remain reserved. GSO cannot issue any part until every requested item is available.',
    'Sent to Finance': 'The GSO Head sent the shortage quantities to Finance. In-stock items remain reserved, and GSO Staff will issue the complete request only after every requested item has arrived.',
    'Stock Received': 'All requested quantities are now in GSO inventory and reserved for you. GSO Staff can prepare the complete issuance.',
    'Delivery Undone': 'GSO Staff corrected a delivery record, so the purchased items are not ready yet. GSO will update you again.',
  };
  const message = messages[status];
  if (!message) return null;
  const eventKey = request.updatedAt ? new Date(request.updatedAt).getTime() : Date.now();
  const notificationTitles = {
    'Needs Information': 'GSO needs more information',
    Approved: 'Purchase requisition approved',
    Rejected: 'Entire purchase requisition declined',
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
      title: 'Entire request approved by GSO Head',
      message: `${request.referenceNo}: the complete request is approved. Only shortage quantities go to Finance; in-stock items stay reserved, and nothing may be issued until every requested item is available.`,
    },
    sentToFinance: {
      title: 'Purchase sent to Finance: you can buy now',
      message: `${request.referenceNo}: the GSO Head sent only the shortage quantities to Finance. Add the bought items in Item Master Data using the requested category and exact name; matching stock is reserved automatically. Confirm a manual link only when the names are similar. The whole request stays on hold until all requested items are available.`,
    },
    readyToIssue: {
      title: 'Entire purchase requisition is ready to issue',
      message: `${request.referenceNo}: every requested item is now reserved. Open Main Issuance to issue the complete request.`,
      href: '/gso/main-issuance',
    },
  };
  const notification = notifications[stage];
  if (!notification) return;
  try {
    await notificationsRepository.createRoleNotification({
      roleKey: 'GSO_STAFF',
      type: 'PURCHASE_REQUISITION',
      ...notification,
      href: notification.href || '/gso/purchase-requisitions',
      dedupeKey: `purchase-staff:${request.id}:${stage}:${request.updatedAt ? new Date(request.updatedAt).getTime() : Date.now()}`,
    });
  } catch (error) {
    console.error('Purchase requisition in-app notification to GSO Staff could not be saved.', { code: error.code, referenceNo: request.referenceNo });
  }
}

const requestTypeLabels = {
  BORROWING: 'Borrow request',
  FACILITY_USE: 'Facility use request',
  JOB_REQUEST: 'Job / service request',
  PURCHASE_REQUISITION: 'Purchase requisition',
  LOSS_DAMAGE_REPORT: 'Loss / damage report',
  ISSUANCE_REQUEST: 'Item issuance request',
};
const gsoRequestPages = {
  PURCHASE_REQUISITION: '/gso/purchase-requisitions',
  BORROWING: '/gso/borrowing-requests',
};

// Notifications and audit entries run after the request change is saved, so a failure is
// logged instead of undoing or failing the user's action.
async function sideEffect(label, work) {
  try {
    await work();
  } catch (error) {
    console.error(`${label} could not be saved.`, { code: error.code, message: error.message });
  }
}

// Role notification keys end in ':' + user id, so resolve them with a prefix ending in ':'.
function notifyRole(roleKey, request, { type = 'REQUEST', key, title, message, href }) {
  return sideEffect(`${roleKey} notification`, () => notificationsRepository.createRoleNotification({
    roleKey,
    type,
    title,
    message: `${request.referenceNo}: ${message}`,
    href,
    dedupeKey: key,
  }));
}

function notifyStaff(request, notice) {
  return notifyRole('GSO_STAFF', request, { href: gsoRequestPages[request.requestType] || '/gso', ...notice });
}

function notifyHead(request, notice) {
  return notifyRole('GSO_HEAD', request, { href: `/gso-head/requests?request=${encodeURIComponent(request.id)}`, ...notice });
}

function resolveNotices(...prefixes) {
  return sideEffect('Notification cleanup', () => Promise.all(prefixes.map((prefix) => notificationsRepository.resolveByPrefix(prefix))));
}

const requesterStatusNotices = {
  'Under Review': ['GSO is reviewing your request', 'GSO Staff started reviewing your request.'],
  'Needs Information': ['GSO needs more information', 'Open the request and reply so GSO can continue.'],
  Approved: ['Request approved', 'Your request was approved. GSO will tell you the next step.'],
  Rejected: ['Request declined', 'GSO declined your request.'],
  'Ready for Pickup': ['Ready for pickup', 'Your item is ready. Pick it up at the GSO office.'],
  Issued: ['Item released to you', 'GSO released the item to you. Return it on or before the due date.'],
  'In Progress': ['Work started', 'GSO started working on your request.'],
  Completed: ['Request completed', 'GSO marked your request as complete.'],
  Returned: ['Return confirmed', 'GSO confirmed that you returned the item. Thank you!'],
  'For Repair': ['Return received: repair needed', 'GSO received the return, and some items need repair.'],
};

function notifyRequesterStatus(request, status, note = '') {
  const notice = requesterStatusNotices[status];
  if (!notice || !request?.requesterId) return null;
  return sideEffect('Requester notification', () => notificationsRepository.createUserNotification({
    userId: request.requesterId,
    type: 'REQUEST',
    title: notice[0],
    message: `${request.referenceNo}: ${notice[1]}${note ? ` Note from GSO: ${note}` : ''}`,
    href: `/requester/requests/${request.id}`,
    dedupeKey: `requester-status:${request.id}:${status}:${Date.now()}`,
  }));
}

const statusAuditAction = {
  Issued: 'issued', Returned: 'returned', 'For Repair': 'returned', Approved: 'approved', Rejected: 'rejected', Cancelled: 'cancelled',
};

function auditRequest(request, user, { action, reason, oldValues, newValues, flag }) {
  if (!request) return null;
  return sideEffect('Request audit entry', () => auditRepository.writeLog(null, {
    entityType: 'request',
    entityKey: request.referenceNo,
    entityName: request.title || requestTypeLabels[request.requestType] || 'Request',
    requestId: request.id,
    action,
    reason,
    oldValues,
    newValues: { status: request.status, ...newValues },
    changedByUserId: user?.id || null,
    flag,
  }));
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
    const hasEmployeePlannedRecipients = validated.formData.items
      .some((item) => item.plannedRecipients.some((recipient) => recipient.destinationType === 'employee'));
    const departmentStaff = hasEmployeePlannedRecipients
      ? await requesterIdentityRepository.listVerifiedDepartmentEmployees(user.id)
      : [];
    const departmentStaffByCode = new Map(departmentStaff.map((staff) => [String(staff.employeeCode).trim().toLowerCase(), staff]));
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
        plannedRecipients: item.plannedRecipients.map((recipient) => {
          if (recipient.destinationType !== 'employee') {
            return {
              ...recipient,
              // A room is the item's location, while the verified requester stays
              // accountable for it as the Employee Head who submitted the request.
              employeeCode: employee.employeeCode,
              employeeName: employee.employeeName,
              email: employee.email,
              position: employee.position,
            };
          }
          const staff = departmentStaffByCode.get(recipient.employeeCode.trim().toLowerCase());
          if (!staff) invalid(`${recipient.employeeCode} ay hindi active staff sa verified department ng requester. Pumili ulit sa department staff list.`);
          return {
            ...recipient,
            employeeCode: staff.employeeCode,
            employeeName: staff.employeeName,
            email: staff.email,
            position: staff.position,
          };
        }),
      })),
    };
  }
  const request = await requestsRepository.createRequest({ ...validated, userId: user.id });
  const typeLabel = requestTypeLabels[request.requestType] || 'Request';
  await notifyStaff(request, {
    key: `staff-new:${request.id}`,
    title: `New ${typeLabel.toLowerCase()}`,
    message: `${request.formData?.requesterName || request.requesterName || 'A requester'} submitted a ${typeLabel.toLowerCase()}. Review it to move it forward.`,
  });
  await auditRequest(request, user, { action: 'created', reason: `${typeLabel} submitted by ${request.formData?.requesterName || request.requesterName || user.name}.` });
  return request;
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

async function listMyActivity(user) {
  return auditRepository.listUserActivity(user.id);
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
  const request = await requestsRepository.changeMineStatus({
    id,
    userId: user.id,
    expectedStatus: current.status,
    status: 'Cancelled',
    note: 'Request cancelled by requester.',
  });
  // Nobody needs to act on it any more.
  await resolveNotices(`staff-new:${id}:`, `staff-reply:${id}:`, `head-approval:${id}:`);
  await notifyStaff(request, {
    key: `staff-cancelled:${id}`,
    title: 'Request cancelled by requester',
    message: `${request.requesterName || 'The requester'} cancelled this request. No further action is needed.`,
  });
  await auditRequest(request, user, { action: 'cancelled', reason: 'Request cancelled by the requester.', oldValues: { status: current.status } });
  return request;
}

async function respondMine(idValue, input, user) {
  const id = validateRequestId(idValue);
  const current = await requestsRepository.getMineById(id, user.id);
  if (!current) invalid('Hindi makita ang request.', 404);
  if (current.status !== 'Needs Information') invalid('Maaaring magbigay ng dagdag na impormasyon kapag Needs Information ang status.', 409);
  const message = text(input?.message, 'response', 2000);
  const request = await requestsRepository.respondToRequest({ id, userId: user.id, message });
  await notifyStaff(request, {
    key: `staff-reply:${id}:${Date.now()}`,
    title: 'Requester replied',
    message: `${request.requesterName || 'The requester'} sent the information GSO asked for. Review the request again.`,
  });
  await auditRequest(request, user, { action: 'updated', reason: 'Requester replied to a request for more information.', oldValues: { status: current.status } });
  return request;
}

async function requestReturn(idValue, user) {
  const id = validateRequestId(idValue);
  const current = await requestsRepository.getMineById(id, user.id);
  if (!current) invalid('Hindi makita ang request.', 404);
  if (current.requestType !== 'BORROWING' || current.status !== 'Issued') {
    invalid('Return request ay para lamang sa kasalukuyang issued na borrowing.', 409);
  }
  const request = await requestsRepository.changeMineStatus({
    id,
    userId: user.id,
    expectedStatus: 'Issued',
    status: 'Return Requested',
    note: 'Requester asked GSO to confirm the physical return.',
  });
  await notifyStaff(request, {
    type: 'RETURN',
    key: `staff-return:${id}`,
    title: 'Return requested',
    message: `${request.requesterName || 'The requester'} is returning a borrowed item. Inspect it and confirm the return.`,
    href: '/gso/borrowing-returns',
  });
  await auditRequest(request, user, { action: 'updated', reason: 'Requester asked GSO to confirm the return.', oldValues: { status: 'Issued' } });
  return request;
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
  await resolveNotices(`staff-new:${id}:`, `staff-reply:${id}:`);
  const waitingForHead = (request.purchaseLines || []).filter((line) => line.routeStatus === 'WAITING_GSO_HEAD');
  if (waitingForHead.length) {
    // A new key each time, so a second batch sent up reopens as unread; resolveByPrefix clears them all on decision.
    await notifyHead(request, {
      key: `head-approval:${id}:${Date.now()}`,
      title: 'Purchase requisition needs your decision',
      message: `GSO Staff sent the complete request (${waitingForHead.length} item line${waitingForHead.length === 1 ? '' : 's'}) for one approval decision (${request.formData?.departmentOrganization || request.requesterName || 'requester'}). Any in-stock quantities are reserved; do not issue any part while an item is short.`,
    });
  }
  await auditRequest(request, user, {
    action: 'updated',
    reason: input.action === 'NEEDS_INFORMATION'
      ? `GSO Staff asked the requester for more information: ${note}`
      : `GSO Staff checked and routed the complete requisition${waitingForHead.length ? `; the whole request is with the GSO Head across ${waitingForHead.length} line(s)` : ''}.${note ? ` Note: ${note}` : ''}`,
    newValues: { routes: (request.purchaseLines || []).map((line) => ({
      lineId: line.id,
      itemName: line.itemName,
      routeStatus: line.routeStatus,
      reservedQuantity: line.reservedQuantity,
      financeQuantity: line.financeQuantity,
    })) },
  });
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
  const result = await savePurchaseDeliveries({ deliveries, receiptReference, user, automatic: false });
  return result.requests;
}

async function savePurchaseDeliveries({ deliveries, receiptReference, user, automatic }) {
  const result = await requestsRepository.recordPurchaseDeliveries({ deliveries, receiptReference, changedBy: user.id });
  for (const request of result.requests) {
    if (result.approvedRequestIds.includes(String(request.id))) {
      await notifyPurchaseRequester(request, 'Stock Received');
      await notifyGsoStaffPurchase(request, 'readyToIssue');
    }
    const linked = deliveries.filter((delivery) => (request.purchaseLines || []).some((line) => String(line.id) === delivery.lineId));
    await auditRequest(request, user, {
      action: 'received',
      reason: `${automatic ? 'Item Master Data automatically reserved the newly received stock for' : 'GSO Staff linked a delivery for'} ${linked.length} item${linked.length === 1 ? '' : 's'}.${receiptReference ? ` Receipt: ${receiptReference}.` : ''}`,
      newValues: { deliveries: linked, receiptReference: receiptReference || null, automatic },
    });
  }
  return result;
}

// Exact category/name matches can be reserved as soon as the GSO Staff records the purchased stock.
// Similar names remain in the manual delivery-link screen because staff must confirm that they are the same item.
async function autoReserveReceivedPurchaseStock({ items, receiptReference = '', user }) {
  const received = new Map();
  for (const item of items || []) {
    const itemId = idOf(item?.itemId, 'inventory record');
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) continue;
    received.set(itemId, (received.get(itemId) || 0) + quantity);
  }
  if (received.size === 0) return { deliveries: [], readyRequests: [] };

  const lines = await requestsRepository.listAwaitingDeliveries({ itemIds: [...received.keys()] });
  const deliveries = [];
  for (const line of lines) {
    let needed = Number(line.remainingQuantity || 0);
    for (const candidate of line.candidates || []) {
      if (needed <= 0 || candidate.match !== 'EXACT') continue;
      const availableFromReceipt = received.get(String(candidate.itemId)) || 0;
      const availableNow = Number(candidate.availableQuantity || 0);
      const quantity = Math.min(needed, availableFromReceipt, availableNow);
      if (quantity < 1) continue;
      deliveries.push({ lineId: String(line.lineId), itemId: String(candidate.itemId), quantity, confirmSimilarName: false });
      received.set(String(candidate.itemId), availableFromReceipt - quantity);
      needed -= quantity;
    }
  }
  if (deliveries.length === 0) return { deliveries: [], readyRequests: [] };

  const result = await savePurchaseDeliveries({
    deliveries,
    receiptReference,
    user,
    automatic: true,
  });
  return {
    deliveries,
    readyRequests: result.requests
      .filter((request) => result.approvedRequestIds.includes(String(request.id)))
      .map((request) => ({ id: String(request.id), referenceNo: request.referenceNo })),
  };
}

async function undoPurchaseDelivery(idValue, receiptIdValue, user) {
  const result = await requestsRepository.undoPurchaseDelivery({
    id: validateRequestId(idValue),
    receiptId: idOf(receiptIdValue, 'delivery record'),
    changedBy: user.id,
  });
  // The requester was told the items were ready, so tell them when that is taken back.
  if (result.reopened) await notifyPurchaseRequester(result.request, 'Delivery Undone');
  await auditRequest(result.request, user, {
    action: 'updated',
    reason: 'GSO Staff undid a recorded purchase delivery. The item stock is no longer reserved for this request.',
    newValues: { receiptId: String(receiptIdValue) },
    flag: 'DELIVERY_UNDONE',
  });
  return result.request;
}

function purchaseLineReadyForStaffIssuance(line) {
  return ['READY_FOR_STAFF', 'PARTIALLY_ISSUED'].includes(line.routeStatus)
    && Number(line.financeQuantity || 0) === 0
    && Number(line.reservedQuantity || 0) >= Number(line.requestedQuantity || 0);
}

function purchaseRequestReadyForStaffIssuance(request) {
  const lines = request?.purchaseLines;
  const allLinesAreAvailable = Array.isArray(lines) && lines.length > 0 && lines.every((line) => (
    ['READY_FOR_STAFF', 'PARTIALLY_ISSUED', 'HANDOVER_PENDING', 'ISSUED'].includes(line.routeStatus)
      && Number(line.financeQuantity || 0) === 0
      && Number(line.reservedQuantity || 0) >= Number(line.requestedQuantity || 0)
  ));
  return allLinesAreAvailable && lines.some(purchaseLineReadyForStaffIssuance);
}

async function getStaffPurchaseRequisitionForIssuance(idValue) {
  const request = await requestsRepository.getById(null, validateRequestId(idValue));
  if (!request || request.requestType !== 'PURCHASE_REQUISITION') invalid('Hindi makita ang purchase requisition.', 404);
  if (!purchaseRequestReadyForStaffIssuance(request)) {
    invalid('Hindi pa kumpleto ang stock ng buong request. Walang item na puwedeng i-issue.', 409);
  }
  return request;
}

async function reviewPurchaseRequisition(idValue, input, user) {
  const id = validateRequestId(idValue);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Hindi valid ang purchase requisition decision.');
  if (!['DECIDE', 'NEEDS_INFORMATION'].includes(input.action)) invalid('Magpasya sa buong request o humingi ng detalye sa requester.');
  const note = text(input.note, 'Note', 2000, { optional: true });
  if (input.action === 'NEEDS_INFORMATION' && !note) invalid('Isulat kung anong detalye ang kailangan mula sa requester.');
  let decision = null;
  if (input.action === 'DECIDE') {
    if (!['APPROVE', 'DECLINE'].includes(input.decision)) invalid('Piliin kung ia-approve o ide-decline ang buong request.');
    decision = input.decision;
    if (decision === 'DECLINE' && !note) invalid('Ilagay ang dahilan kung bakit idinedecline ang buong request.');
  }
  const request = await requestsRepository.reviewPurchaseRequisition({
    id,
    action: input.action,
    decision,
    note,
    changedBy: user.id,
  });
  const requesterNotified = await notifyPurchaseRequester(request, request.status, note);
  if (request.status === 'GSO Endorsed') await notifyGsoStaffPurchase(request, 'endorsed');
  // The Head has decided, so the "needs your decision" reminder is done.
  await resolveNotices(`head-approval:${id}:`);
  if (input.action === 'DECIDE' && request.status !== 'GSO Endorsed') {
    const shortageLines = (request.purchaseLines || []).filter((line) => Number(line.financeQuantity || 0) > 0);
    const approvedMessage = decision === 'DECLINE'
      ? `GSO Head declined the entire request${note ? `: ${note}` : '.'}`
      : shortageLines.length
        ? `GSO Head approved the entire request. ${shortageLines.length} item line(s) are going to Finance; all in-stock items remain reserved. Nothing can be issued until every requested item is available.`
        : 'GSO Head approved the entire request. All requested items are reserved and ready for GSO Staff issuance.';
    await notifyStaff(request, {
      key: `staff-head-decided:${id}:${Date.now()}`,
      title: decision === 'DECLINE' ? 'GSO Head declined the request' : 'GSO Head approved the entire request',
      message: approvedMessage,
    });
  }
  await auditRequest(request, user, {
    action: input.action === 'NEEDS_INFORMATION' ? 'updated' : decision === 'DECLINE' ? 'rejected' : 'approved',
    reason: input.action === 'NEEDS_INFORMATION'
      ? `GSO Head asked the requester for more information: ${note}`
      : `GSO Head ${decision === 'APPROVE' ? 'approved' : 'declined'} the entire purchase requisition.${note ? ` Note: ${note}` : ''}`,
    newValues: { decision },
  });
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
    const failed = await requestsRepository.failFinanceHandoff({ id, changedBy: user.id });
    console.error('Purchase requisition email to Finance could not be delivered.', {
      code: error.code,
      responseCode: error.responseCode,
      command: error.command,
    });
    await notifyHead(failed || current, {
      key: `head-finance-failed:${id}:${Date.now()}`,
      title: 'Email to Finance failed',
      message: `The email to ${financeEmail} was not delivered. Open the requisition and send it again.`,
      href: '/gso-head/requests?tab=finance',
    });
    await auditRequest(failed || current, user, { action: 'updated', reason: `Email to Finance (${financeEmail}) could not be delivered.`, newValues: { financeEmail } });
    invalid('Hindi naipadala ang email sa Finance. Naka-save ang requisition at maaari itong subukang ipadala muli.', 502);
  }

  const completedRequest = await requestsRepository.completeFinanceHandoff({ id, messageId: sent.messageId, changedBy: user.id });
  const requesterNotified = await notifyPurchaseRequester(completedRequest, 'Sent to Finance');
  await notifyGsoStaffPurchase(completedRequest, 'sentToFinance');
  await resolveNotices(`head-finance-failed:${id}:`);
  await auditRequest(completedRequest, user, {
    action: 'updated',
    reason: `GSO Head sent the purchase requisition to Finance (${financeEmail}).`,
    newValues: { financeEmail, items: financeItems.map((item) => `${item.quantity} ${item.itemName}`) },
  });
  return { request: completedRequest, requesterNotified };
}

async function getForGso(idValue) {
  const request = await requestsRepository.getById(null, validateRequestId(idValue));
  if (!request) invalid('Hindi makita ang request.', 404);
  if (request.requestType === 'PURCHASE_REQUISITION' && !purchaseRequestReadyForStaffIssuance(request)) {
    invalid('Hindi pa kumpleto ang stock ng buong request. Walang item na puwedeng i-issue.', 409);
  }
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

  const updated = await requestsRepository.setStatus({
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
  // Purchase requisitions get their own messages; everything else gets the in-app notice.
  await notifyRequesterStatus(updated, status, note);
  await resolveNotices(`staff-return:${id}:`, `staff-new:${id}:`, `staff-reply:${id}:`);
  await auditRequest(updated, user, {
    action: statusAuditAction[status] || 'updated',
    reason: `${requestTypeLabels[current.requestType] || 'Request'} moved from ${current.status} to ${status}.${note ? ` Note: ${note}` : ''}`,
    oldValues: { status: current.status },
    newValues: { dueDate: dueDate || null, conditionOut, conditionIn, conditionsIn },
  });
  return updated;
}

module.exports = {
  listAssets,
  listPurchaseItemNames,
  createRequest,
  listRequesterDepartmentStaff,
  listMine,
  listMyActivity,
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
  autoReserveReceivedPurchaseStock,
  undoPurchaseDelivery,
  reviewPurchaseRequisition,
  sendPurchaseRequisitionToFinance,
  getForGso,
  updateStatus,
};
