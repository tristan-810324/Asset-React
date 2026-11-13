const nodemailer = require('nodemailer');
const env = require('../../config/env');
const requestsRepository = require('./requests.repository');
const requesterIdentityRepository = require('../requester-identity/requester-identity.repository');
const { buildPurchaseRequisitionPdf } = require('./purchase-requisition-pdf');
const { STAFF_ROUTES } = require('./requisition-routing');
const notificationsRepository = require('../notifications/notifications.repository');
const auditRepository = require('../audit/audit.repository');
const signaturesService = require('../signatures/signatures.service');
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
    'GSO Endorsed': 'The GSO Head approved the complete request. The signed requisition is ready for GSO Staff to print and hand to Finance; in-stock items remain reserved.',
    'Sent to Finance': 'GSO Staff handed the signed requisition to Finance. In-stock items remain reserved, and GSO Staff will issue the complete request only after every requested item has arrived.',
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
    'Sent to Finance': 'Purchase requisition handed to Finance',
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
      message: `${request.referenceNo}: the signed PDF is ready in Procurement. Download or print it and give it to Finance; in-stock items stay reserved until every requested item is available.`,
      href: '/gso/procurement',
    },
    sentToFinance: {
      title: 'Purchase sent to Finance: you can buy now',
      message: `${request.referenceNo}: the GSO Head sent only the shortage quantities to Finance. Add the bought items in Item Master Data using the requested category and exact name; matching stock is reserved automatically. Confirm a manual link only when the names are similar. The whole request stays on hold until all requested items are available.`,
    },
    readyToIssue: {
      title: 'Entire purchase requisition is ready to issue',
      message: `${request.referenceNo}: every requested item is now reserved. Open Main Issuance to issue the complete request.`,
      href: `/gso/main-issuance?purchaseRequisitionId=${encodeURIComponent(request.id)}`,
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

// A borrowing return names each item and the condition GSO recorded, for the requester and the audit log.
function describeBorrowingReturn(current, conditionsIn) {
  return current.assets
    .filter((asset) => conditionsIn[String(asset.id)])
    .map((asset) => `${asset.itemName || asset.itemCode || 'Item'} × ${asset.quantity} (${conditionsIn[String(asset.id)]})`)
    .join(', ');
}

function notifyBorrowingReturn(request, status, itemsText, note = '') {
  if (!request?.requesterId) return null;
  const receivedAt = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date());
  const repaired = status === 'For Repair';
  return sideEffect('Requester notification', () => notificationsRepository.createUserNotification({
    userId: request.requesterId,
    type: 'RETURN',
    title: repaired ? 'Return received: repair needed' : 'Return confirmed',
    message: `${request.referenceNo}: GSO received ${itemsText} from you on ${receivedAt}. ${repaired ? 'The damaged item was sent for repair.' : 'Your return is complete. Thank you!'}${note ? ` Note from GSO: ${note}` : ''}`,
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
    // Approval starts the borrowing (see setStatus); no pickup step. Ready for Pickup is kept only for older records.
    Approved: ['Issued'],
    'Ready for Pickup': ['Issued'],
    // GSO inspects the item when it is surrendered; a requester's return request is optional.
    Issued: ['Returned', 'For Repair'],
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
    invalid('A return can only be requested for a borrowing that is currently issued.', 409);
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

async function listItemsToBuy() {
  return requestsRepository.listItemsToBuy();
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
  if (received.size === 0) return { deliveries: [], linkedRequests: [], readyRequests: [] };

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
  if (deliveries.length === 0) return { deliveries: [], linkedRequests: [], readyRequests: [] };

  const result = await savePurchaseDeliveries({
    deliveries,
    receiptReference,
    user,
    automatic: true,
  });
  const deliveredByLine = new Map();
  for (const delivery of deliveries) {
    const lineId = String(delivery.lineId);
    deliveredByLine.set(lineId, (deliveredByLine.get(lineId) || 0) + delivery.quantity);
  }
  const approvedIds = new Set(result.approvedRequestIds.map(String));
  const linkedRequests = result.requests.flatMap((request) => {
    const receivedLines = (request.purchaseLines || [])
      .filter((line) => deliveredByLine.has(String(line.id)))
      .map((line) => ({ itemName: line.itemName, quantity: deliveredByLine.get(String(line.id)) }));
    if (receivedLines.length === 0) return [];
    return [{
      id: String(request.id),
      referenceNo: request.referenceNo,
      requesterName: request.formData?.requesterName || request.requesterName || '',
      readyForIssuance: approvedIds.has(String(request.id)),
      items: receivedLines,
    }];
  });
  return {
    deliveries,
    linkedRequests,
    readyRequests: linkedRequests
      .filter((request) => request.readyForIssuance)
      .map(({ id, referenceNo, requesterName, items }) => ({ id, referenceNo, requesterName, items })),
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
  if (input.action !== 'DECIDE') invalid('Magpasya sa buong request.');
  const note = text(input.note, 'Note', 2000, { optional: true });
  if (!['APPROVE', 'DECLINE'].includes(input.decision)) invalid('Piliin kung ia-approve o ide-decline ang buong request.');
  const decision = input.decision;
  if (decision === 'DECLINE' && !note) invalid('Ilagay ang dahilan kung bakit idinedecline ang buong request.');
  const request = await requestsRepository.reviewPurchaseRequisition({
    id,
    decision,
    note,
    changedBy: user.id,
  });
  const requesterNotified = await notifyPurchaseRequester(request, request.status, note);
  if (request.status === 'GSO Endorsed') await notifyGsoStaffPurchase(request, 'endorsed');
  // The Head has decided, so the "needs your decision" reminder is done.
  await resolveNotices(`head-approval:${id}:`);
  if (request.status !== 'GSO Endorsed') {
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
    action: decision === 'DECLINE' ? 'rejected' : 'approved',
    reason: `GSO Head ${decision === 'APPROVE' ? 'approved' : 'declined'} the entire purchase requisition.${note ? ` Note: ${note}` : ''}`,
    newValues: { decision },
  });
  return { request, requesterNotified };
}

// GSO Staff confirms the physical delivery of the GSO Head-approved PDF to Finance.
// The existing sent status keeps downstream purchase and delivery rules intact.
async function handPurchaseRequisitionToFinance(idValue, user) {
  const id = validateRequestId(idValue);
  const request = await requestsRepository.completePhysicalFinanceHandoff({ id, changedBy: user.id });
  const requesterNotified = await notifyPurchaseRequester(request, 'Sent to Finance');
  await resolveNotices(`purchase-staff:${id}:endorsed:`);
  await auditRequest(request, user, {
    action: 'updated',
    reason: 'GSO Staff handed the signed printed requisition to Finance.',
    newValues: { handoffMethod: 'printed PDF' },
  });
  return { request, requesterNotified };
}

async function getFinancePdf(idValue) {
  const id = validateRequestId(idValue);
  const current = await requestsRepository.getById(null, id);
  if (!current) invalid('Hindi makita ang purchase requisition.', 404);
  if (!['GSO Endorsed', 'Finance Handoff Pending', 'Finance Handoff Failed', 'Sent to Finance'].includes(current.status)
    || !current.gsoHeadEndorsedByUserId) {
    invalid('Ipa-approve muna ng GSO Head ang requisition bago i-print para sa Finance.', 409);
  }
  const financeLines = (current.purchaseLines || []).filter((line) => Number(line.financeQuantity) > 0);
  if (financeLines.length === 0) invalid('Walang Finance items sa requisition na ito.', 409);
  const formData = current.formData || {};
  const financeItems = financeLines.map((line) => ({
    itemName: line.itemName,
    category: line.category,
    quantity: Number(line.financeQuantity),
    requestedQuantity: Number(line.requestedQuantity),
    stockAvailableQuantity: Number(line.reservedQuantity),
    description: line.specifications,
  }));
  const requestForFinance = { ...current, formData: { ...formData, items: financeItems } };
  const signature = await signaturesService.getSignatureForDocument(current.gsoHeadEndorsedByUserId);
  const pdfBuffer = buildPurchaseRequisitionPdf({
    request: requestForFinance,
    endorsedBy: current.gsoHeadEndorsedByName || '—',
    endorsedEmail: current.gsoHeadEndorsedByEmail || '',
    signaturePng: signature?.png ?? null,
  });
  return {
    pdf: pdfBuffer.toString('base64'),
    filename: `Purchase-Requisition-${current.referenceNo}.pdf`,
    referenceNo: current.referenceNo,
  };
}

const financePdfReprintReasons = [
  'Original copy lost or misplaced',
  'Copy damaged, torn, or unreadable',
  'Printer or paper error',
  'Finance requested another copy',
  'Other',
];

async function logFinancePdfReprint(idValue, input, user) {
  const id = validateRequestId(idValue);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Hindi valid ang reprint reason.');
  if (!financePdfReprintReasons.includes(input.reason)) invalid('Pumili ng reason para sa reprint.');
  const details = input.reason === 'Other' ? text(input.details, 'Purpose', 300) : '';
  if (input.reason === 'Other' && details.length < 5) invalid('Ilagay ang totoong purpose, hindi bababa sa 5 characters.');
  const current = await requestsRepository.getById(null, id);
  if (!current) invalid('Hindi makita ang purchase requisition.', 404);
  if (current.status !== 'Sent to Finance') invalid('Hindi pa na-hand off sa Finance ang requisition na ito. I-download muna ito bilang unang kopya.', 409);
  // Written directly instead of as a side effect: if the entry cannot be saved, the request fails and nothing is released.
  await auditRepository.writeLog(null, {
    entityType: 'request',
    entityKey: current.referenceNo,
    entityName: current.title || requestTypeLabels[current.requestType] || 'Request',
    requestId: current.id,
    action: 'updated',
    reason: `Signed PDF reprinted. Reason: ${details ? `${input.reason}: ${details}` : input.reason}`,
    newValues: { reprintReason: input.reason, reprintDetails: details || null },
    changedByUserId: user.id,
    flag: 'FINANCE_PDF_REPRINT',
  });
  return { referenceNo: current.referenceNo };
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
  if (!current) invalid('Request not found.', 404);
  if (current.requestType === 'PURCHASE_REQUISITION') {
    if (current.status !== 'Approved' || status !== 'Completed') invalid('Approved purchase requisitions lang ang maaaring markahang Completed pagkatapos ng issuance.', 403);
    if (!note) invalid('Ilagay ang issuance batch reference pagkatapos maitala ang issuance.');
  }
  const allowed = transitions[current.requestType]?.[current.status] || [];
  if (!allowed.includes(status)) invalid(`Status cannot change from ${current.status} to ${status}.`, 409);
  if (['Rejected', 'Needs Information'].includes(status) && !note) invalid('Add a reason or the information the requester needs.');

  // Approving a borrowing starts it right away: the approval is saved as Approved, then Issued in the same transaction.
  const activatesBorrowing = current.requestType === 'BORROWING' && status === 'Approved';
  const effectiveStatus = activatesBorrowing ? 'Issued' : status;
  let dueDate;
  if (effectiveStatus === 'Issued') {
    dueDate = text(input.dueDate || current.formData.returnDate, 'due date', 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) invalid('Invalid due date.');
    const [year, month, day] = dueDate.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) invalid('Invalid due date.');
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (dueDate < todayIso) invalid('Choose a due date today or later.');
  }
  const conditionOut = input.conditionOut || 'Good';
  let conditionIn = input.conditionIn || (status === 'For Repair' ? 'Needs Repair' : 'Good');
  if (!conditions.has(conditionOut) || !conditions.has(conditionIn)) invalid('Choose a valid item condition.');

  // A return is inspected item by item, whether the requester asked for it or GSO inspects it when it is
  // surrendered. Nothing defaults to Good, and damaged items keep the request in For Repair so they are not lent out again.
  let conditionsIn = null;
  if (current.requestType === 'BORROWING' && ['Issued', 'Return Requested'].includes(current.status) && ['Returned', 'For Repair'].includes(status)) {
    const provided = input.conditionsIn && typeof input.conditionsIn === 'object' && !Array.isArray(input.conditionsIn)
      ? input.conditionsIn
      : {};
    conditionsIn = {};
    for (const asset of current.assets.filter((entry) => !entry.returnedAt)) {
      const condition = provided[String(asset.id)];
      if (!conditions.has(condition) || condition === 'Retired') {
        invalid(`Choose the returned condition for ${asset.itemName || 'this item'}.`);
      }
      conditionsIn[String(asset.id)] = condition;
    }
    const damaged = Object.values(conditionsIn).some((condition) => repairConditions.has(condition));
    if (damaged && status !== 'For Repair') invalid('A returned item is damaged, so choose For Repair.', 409);
    if (!damaged && status === 'For Repair') invalid('No returned item is damaged, so choose Returned.', 409);
    if (damaged && !note) invalid('Describe the damage in the review note.');
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
  // A borrowing return names the items and their recorded condition; everything else gets the standard notice.
  const returnedItems = current.requestType === 'BORROWING' && conditionsIn ? describeBorrowingReturn(current, conditionsIn) : '';
  if (returnedItems) await notifyBorrowingReturn(updated, status, returnedItems, note);
  else await notifyRequesterStatus(updated, effectiveStatus, note);
  await resolveNotices(`staff-return:${id}:`, `staff-new:${id}:`, `staff-reply:${id}:`);
  await auditRequest(updated, user, {
    action: statusAuditAction[effectiveStatus] || 'updated',
    reason: returnedItems
      ? `Borrowing ${status === 'For Repair' ? 'returned for repair' : 'returned'}: ${returnedItems}.${note ? ` Note: ${note}` : ''}`
      : `${requestTypeLabels[current.requestType] || 'Request'} moved from ${current.status} to ${effectiveStatus}.${note ? ` Note: ${note}` : ''}`,
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
  listItemsToBuy,
  staffReviewPurchaseRequisition,
  getStaffPurchaseRequisitionForIssuance,
  listAwaitingPurchaseDeliveries,
  recordPurchaseDeliveries,
  autoReserveReceivedPurchaseStock,
  undoPurchaseDelivery,
  reviewPurchaseRequisition,
  handPurchaseRequisitionToFinance,
  getFinancePdf,
  logFinancePdfReprint,
  getForGso,
  updateStatus,
};
