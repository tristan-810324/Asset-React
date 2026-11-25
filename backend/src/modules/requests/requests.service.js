const nodemailer = require('nodemailer');
const env = require('../../config/env');
const requestsRepository = require('./requests.repository');
const requesterIdentityRepository = require('../requester-identity/requester-identity.repository');
const { buildPurchaseRequisitionPdf } = require('./purchase-requisition-pdf');
const { STAFF_ROUTES } = require('./requisition-routing');
const notificationsRepository = require('../notifications/notifications.repository');
const auditRepository = require('../audit/audit.repository');
const signaturesService = require('../signatures/signatures.service');
const facilityFlow = require('./facility-flow.service');
const facilityRepository = require('./facility-flow.repository');
const serviceWorkOrders = require('./service-work-orders.service');
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
    Rejected: `GSO declined the complete requisition.${declinedText}`,
    'Items Declined': `Some items in your requisition could not be issued.${declinedText} The other items continue; check My Requests for each item.`,
    Completed: `Your requisition is complete. Check My Requests for each item.${declinedText}`,
    'GSO Endorsed': 'GSO Head approved the request. The signed requisition is ready to print for Finance. In-stock items stay reserved.',
    'Sent to Finance': 'The signed requisition is with Finance. In-stock items stay reserved until every item arrives.',
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
    'Items Declined': 'Some items declined',
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
  FACILITY_USE: '/gso/facility-requests',
  LOSS_DAMAGE_REPORT: '/gso/loss-damage-cases',
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
  const page = gsoRequestPages[request.requestType];
  return notifyRole('GSO_STAFF', request, { href: page ? `${page}?request=${encodeURIComponent(request.id)}` : '/gso', ...notice });
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

// A facility approval says whether items are waiting to be picked up, or only the venue is booked.
function facilityApprovalNotice(request) {
  return request.assets?.length > 0
    ? ['Facility approved. Items ready to pick up', 'Your facility and items were approved. Bring your slip to the GSO office to get the items.']
    : ['Facility approved', 'Your facility request was approved. You can use the facility on the approved date.'];
}

function notifyRequesterStatus(request, status, note = '') {
  const notice = request.requestType === 'FACILITY_USE' && status === 'Approved' ? facilityApprovalNotice(request) : requesterStatusNotices[status];
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
    // With items: Approved → Issued (released) → Returned or For Repair → Completed. Without items: Approved → Completed.
    // facility-flow.service.js checks which of these a request may take.
    Approved: ['Issued', 'Completed', 'Closed'],
    Issued: ['Returned', 'For Repair'],
    'For Repair': ['Returned'],
    Returned: ['Completed'],
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

async function listAssets(options) {
  return requestsRepository.listAssets(options);
}

async function listPurchaseItemNames() {
  return requestsRepository.listPurchaseItemNames();
}

async function createRequest(input, user) {
  if (!(await requesterIdentityRepository.isVerified(user.id))) {
    invalid('Complete your requester identity profile and wait for GSO to verify it before you submit a request.', 403);
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
        invalid('The saved item name does not match the chosen category. Choose again from the list.');
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
      if (!catalogItem) invalid('The chosen Item Master Data record was not found. Refresh the catalog and choose again.');
      if (!catalogCategoryMatches(item.category, catalogItem.category)
        || catalogItem.name.trim().toLowerCase() !== item.itemName.trim().toLowerCase()) {
        invalid('The chosen item does not match the requisition category. Choose again from Item Master Data.');
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
    if (!employee) invalid('No active verified employee record was found. Contact GSO.', 403);
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
        itemKind: item.itemKind,
        unitOfMeasure: item.unitOfMeasure,
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
          if (!staff) invalid(`${recipient.employeeCode} is not active staff in the requester's verified department. Choose again from the department staff list.`);
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
  if (request.requestType === 'JOB_REQUEST') {
    // A job goes to the team that owns its category (GSO or ITSS), not to every GSO Staff account.
    await sideEffect('Service team notification', () => serviceWorkOrders.notifyNewWorkOrder(request));
  } else {
    await notifyStaff(request, {
      key: `staff-new:${request.id}`,
      title: `New ${typeLabel.toLowerCase()}`,
      message: `${request.formData?.requesterName || request.requesterName || 'A requester'} submitted a ${typeLabel.toLowerCase()}. Review it to move it forward.`,
    });
  }
  // The requester's own confirmation, so the bell shows that the request went through.
  await sideEffect('Requester notification', () => notificationsRepository.createUserNotification({
    userId: request.requesterId,
    type: 'REQUEST',
    title: 'Request submitted',
    message: `${request.referenceNo}: GSO received your ${typeLabel.toLowerCase()} and will review it.`,
    href: `/requester/requests/${request.id}`,
    dedupeKey: `requester-submitted:${request.id}`,
  }));
  await auditRequest(request, user, { action: 'created', reason: `${typeLabel} submitted by ${request.formData?.requesterName || request.requesterName || user.name}.` });
  return serviceWorkOrders.enrichRequest(request);
}

async function listRequesterDepartmentStaff(user) {
  if (!(await requesterIdentityRepository.getVerifiedEmployeeSummary(user.id))) {
    invalid('Complete your requester identity profile and wait for GSO to verify it before you choose staff.', 403);
  }
  return requesterIdentityRepository.listVerifiedDepartmentEmployees(user.id);
}

async function listMine(user) {
  return serviceWorkOrders.enrichRequests(await requestsRepository.listMine(user.id));
}

async function listMyActivity(user) {
  return auditRepository.listUserActivity(user.id);
}

async function getMine(idValue, user) {
  const request = await requestsRepository.getMineById(validateRequestId(idValue), user.id);
  if (!request) invalid('Request not found.', 404);
  return serviceWorkOrders.enrichRequest(request, { withPhotos: true });
}

async function cancelMine(idValue, user) {
  const id = validateRequestId(idValue);
  const current = await requestsRepository.getMineById(id, user.id);
  if (!current) invalid('Request not found.', 404);
  const isUnissuedAutoApproval = current.requestType === 'PURCHASE_REQUISITION'
    && current.status === 'Approved'
    && Array.isArray(current.purchaseLines)
    && current.purchaseLines.every((line) => line.routeStatus === 'READY_FOR_STAFF' && Number(line.issuedQuantity || 0) === 0);
  if (!['Submitted', 'Needs Information'].includes(current.status) && !isUnissuedAutoApproval) {
    invalid('This request cannot be cancelled in its current status.', 409);
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
  if (request.requestType === 'JOB_REQUEST') {
    await sideEffect('Service team notification', () => serviceWorkOrders.notifyCancelled(request));
  } else {
    await notifyStaff(request, {
      key: `staff-cancelled:${id}`,
      title: 'Request cancelled by requester',
      message: `${request.requesterName || 'The requester'} cancelled this request. No further action is needed.`,
    });
  }
  await auditRequest(request, user, { action: 'cancelled', reason: 'Request cancelled by the requester.', oldValues: { status: current.status } });
  return request;
}

async function respondMine(idValue, input, user) {
  const id = validateRequestId(idValue);
  const current = await requestsRepository.getMineById(id, user.id);
  if (!current) invalid('Request not found.', 404);
  if (current.status !== 'Needs Information') invalid('You can add more information only when the status is Needs Information.', 409);
  const message = text(input?.message, 'response', 2000);
  const request = await requestsRepository.respondToRequest({ id, userId: user.id, message });
  if (request.requestType === 'JOB_REQUEST') {
    await sideEffect('Service team notification', () => serviceWorkOrders.notifyRequesterReply(request));
  } else {
    await notifyStaff(request, {
      key: `staff-reply:${id}:${Date.now()}`,
      title: 'Requester replied',
      message: `${request.requesterName || 'The requester'} sent the information GSO asked for. Review the request again.`,
    });
  }
  await auditRequest(request, user, { action: 'updated', reason: 'Requester replied to a request for more information.', oldValues: { status: current.status } });
  return serviceWorkOrders.enrichRequest(request);
}

// The requester confirms or reopens a completed job. The work-order service checks ownership and status.
async function confirmServiceMine(idValue, input, user) {
  const id = validateRequestId(idValue);
  await serviceWorkOrders.confirmService(id, input, user);
  return getMine(id, user);
}

async function reopenServiceMine(idValue, input, user) {
  const id = validateRequestId(idValue);
  await serviceWorkOrders.reopenService(id, input, user);
  return getMine(id, user);
}

async function requestReturn(idValue, user) {
  const id = validateRequestId(idValue);
  const current = await requestsRepository.getMineById(id, user.id);
  if (!current) invalid('Request not found.', 404);
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
  if (status && !purchaseRequisitionStatuses.has(status)) invalid('Invalid purchase requisition status filter.');
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
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Invalid staff review.');
  if (!['ROUTE', 'NEEDS_INFORMATION'].includes(input.action)) invalid('Choose whether to route the items or ask the requester for details.');
  const note = text(input.note, 'Note', 2000, { optional: true });
  if (input.action === 'NEEDS_INFORMATION' && !note) invalid('Write what details you need from the requester.');
  // The units GSO Staff picked as matching each requested item; the server checks them again under lock.
  const selectedUnits = {};
  if (input.action === 'ROUTE') {
    if (!input.selectedUnits || typeof input.selectedUnits !== 'object' || Array.isArray(input.selectedUnits)) invalid('Refresh the requisition before you route it.');
    for (const [lineId, itemIds] of Object.entries(input.selectedUnits)) {
      if (!/^\d{1,18}$/.test(lineId) || !Array.isArray(itemIds) || itemIds.some((itemId) => !/^\d{1,18}$/.test(String(itemId)))) {
        invalid('Invalid unit selected. Refresh the requisition.');
      }
      selectedUnits[lineId] = itemIds.map(String);
    }
  }
  // Consumable lines GSO Staff issue from storage now. The repository checks each one again under lock.
  const issueNowLineIds = [];
  if (input.action === 'ROUTE' && input.issueNowLineIds !== undefined) {
    if (!Array.isArray(input.issueNowLineIds) || input.issueNowLineIds.some((lineId) => !/^\d{1,18}$/.test(String(lineId)))) {
      invalid('Invalid item chosen to issue now. Refresh the requisition.');
    }
    issueNowLineIds.push(...input.issueNowLineIds.map(String));
  }
  // Consumable lines GSO Staff reject. One reason covers them all, and the requester sees it.
  const rejectLineIds = [];
  if (input.action === 'ROUTE' && input.rejectLineIds !== undefined) {
    if (!Array.isArray(input.rejectLineIds) || input.rejectLineIds.some((lineId) => !/^\d{1,18}$/.test(String(lineId)))) {
      invalid('Invalid item chosen to reject. Refresh the requisition.');
    }
    rejectLineIds.push(...input.rejectLineIds.map(String));
  }
  if (rejectLineIds.length && !note) invalid('Write the reason for rejecting the item.');
  const request = await requestsRepository.staffReviewPurchaseRequisition({
    id,
    action: input.action,
    note,
    selectedUnits,
    issueNowLineIds,
    rejectLineIds,
    changedBy: user.id,
  });
  // Per-unit items reserved to issue now without GSO Head approval get a yellow flag in the GSO audit logs, not in the requester's timeline.
  for (const line of request.purchaseLines || []) {
    if (!issueNowLineIds.includes(String(line.id))) continue;
    if ((request.formData?.items || [])[Number(line.lineNumber) - 1]?.itemKind !== 'PER_UNIT') continue;
    await auditRequest(request, user, {
      action: 'updated',
      reason: `${line.itemName} × ${line.requestedQuantity} reserved to issue now without GSO Head approval, because the full quantity is in stock.`,
      newValues: { lineId: line.id, issuedNow: line.requestedQuantity },
      flag: 'PER_UNIT_ISSUED_WITHOUT_HEAD',
    });
  }
  // A rejection reaches the requester at once, even while the rest of the request waits for the GSO Head.
  const rejected = (request.purchaseLines || []).some((line) => line.routeStatus === 'REJECTED');
  const requesterNotified = rejected || ['Needs Information', 'Approved'].includes(request.status)
    ? await notifyPurchaseRequester(request, rejected && !['Rejected', 'Completed'].includes(request.status) ? 'Items Declined' : request.status, note)
    : null;
  await resolveNotices(`staff-new:${id}:`, `staff-reply:${id}:`);
  const waitingForHead = (request.purchaseLines || []).filter((line) => line.routeStatus === 'WAITING_GSO_HEAD');
  if (waitingForHead.length) {
    // A new key each time, so a second batch sent up reopens as unread; resolveByPrefix clears them all on decision.
    await notifyHead(request, {
      key: `head-approval:${id}:${Date.now()}`,
      title: 'Purchase requisition needs your decision',
      message: `GSO Staff sent ${waitingForHead.length} item line${waitingForHead.length === 1 ? '' : 's'} for one approval decision (${request.formData?.departmentOrganization || request.requesterName || 'requester'}).${(request.purchaseLines || []).some((line) => line.routeStatus === 'READY_FOR_STAFF') ? ' Items already in stock are issued separately and are not part of this decision.' : ''}`,
    });
  }
  await auditRequest(request, user, {
    action: 'updated',
    reason: input.action === 'NEEDS_INFORMATION'
      ? `GSO Staff asked the requester for more information: ${note}`
      : `GSO Staff checked and routed the requisition${waitingForHead.length ? `; ${waitingForHead.length} line(s) are with the GSO Head` : ''}${rejectLineIds.length ? `; ${rejectLineIds.length} consumable line(s) rejected` : ''}.${note ? ` Note: ${note}` : ''}`,
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
  if (!/^\d{1,18}$/.test(id)) invalid(`Invalid ${label}. Refresh the page.`);
  return id;
}

// The requisition items that have a delivery waiting to be linked, with the inventory records that could fill them.
async function listAwaitingPurchaseDeliveries(query = {}) {
  const itemIds = query.itemIds ? String(query.itemIds).split(',').map((id) => idOf(id, 'inventory record')) : [];
  if (itemIds.length > 500) invalid('Too many inventory records were selected.');
  return requestsRepository.listAwaitingDeliveries({ itemIds });
}

// GSO Staff pick another unit from storage for a ready requisition line.
async function swapRequisitionUnit(input, user) {
  const positiveId = (value, label) => {
    const text = String(value ?? '');
    if (!/^\d{1,20}$/.test(text) || text === '0') invalid(`Invalid ${label}.`);
    return text;
  };
  return requestsRepository.swapRequisitionUnit({
    lineId: positiveId(input?.lineId, 'requisition item'),
    fromItemId: positiveId(input?.fromItemId, 'reserved unit'),
    toItemId: positiveId(input?.toItemId, 'storage unit'),
    changedBy: user.id,
  });
}

// GSO Staff link what they bought (already added in Item Master Data) to the requests waiting for it.
async function recordPurchaseDeliveries(input, user) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Invalid delivery details.');
  if (!Array.isArray(input.deliveries) || input.deliveries.length === 0 || input.deliveries.length > 200) {
    invalid('Choose at least one item to link the delivery to.');
  }
  const seen = new Set();
  const deliveries = input.deliveries.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) invalid('Invalid delivery details.');
    const delivery = {
      lineId: idOf(entry.lineId, 'requested item'),
      itemId: idOf(entry.itemId, 'inventory record'),
      quantity: Number(entry.quantity),
      confirmSimilarName: entry.confirmSimilarName === true,
    };
    if (!Number.isInteger(delivery.quantity) || delivery.quantity < 1 || delivery.quantity > 100000) {
      invalid('The received quantity must be a whole number of at least 1.');
    }
    const key = `${delivery.lineId}:${delivery.itemId}`;
    if (seen.has(key)) invalid('There is a duplicate delivery for the same item and inventory record.');
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
  // Rejected lines are not part of the request any more.
  const lines = Array.isArray(request?.purchaseLines) ? request.purchaseLines.filter((line) => line.routeStatus !== 'REJECTED') : [];
  const allLinesAreAvailable = lines.length > 0 && lines.every((line) => (
    ['READY_FOR_STAFF', 'PARTIALLY_ISSUED', 'HANDOVER_PENDING', 'ISSUED'].includes(line.routeStatus)
      && Number(line.financeQuantity || 0) === 0
      && Number(line.reservedQuantity || 0) >= Number(line.requestedQuantity || 0)
  ));
  // While the GSO Head is still deciding, items already in stock can be issued now.
  return (allLinesAreAvailable || request?.status === 'Under Review') && lines.some(purchaseLineReadyForStaffIssuance);
}

async function getStaffPurchaseRequisitionForIssuance(idValue) {
  const request = await requestsRepository.getById(null, validateRequestId(idValue));
  if (!request || request.requestType !== 'PURCHASE_REQUISITION') invalid('Purchase requisition not found.', 404);
  if (!purchaseRequestReadyForStaffIssuance(request)) {
    invalid('The stock for the whole request is not complete yet. No item can be issued.', 409);
  }
  // Only units that are free now; a unit reserved for another request is not offered.
  const storageCandidates = await requestsRepository.listRequisitionStorageCandidates(request.id);
  return { ...request, storageCandidates };
}

async function reviewPurchaseRequisition(idValue, input, user) {
  const id = validateRequestId(idValue);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Invalid purchase requisition decision.');
  if (input.action !== 'DECIDE') invalid('Make a decision on the whole request.');
  const note = text(input.note, 'Note', 2000, { optional: true });
  if (!['APPROVE', 'DECLINE'].includes(input.decision)) invalid('Choose whether to approve or decline the whole request.');
  const decision = input.decision;
  if (decision === 'DECLINE' && !note) invalid('Enter the reason for declining the whole request.');
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
      ? `GSO Head declined the items waiting for approval${note ? `: ${note}` : '.'}`
      : shortageLines.length
        ? `GSO Head approved the request. ${shortageLines.length} item line(s) go to Finance. In-stock items stay reserved. Nothing is issued until every item is available.`
        : 'GSO Head approved the items waiting for approval. All of them are reserved and ready for GSO Staff issuance.';
    await notifyStaff(request, {
      key: `staff-head-decided:${id}:${Date.now()}`,
      title: decision === 'DECLINE' ? 'GSO Head declined the request' : 'GSO Head approved the request',
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
  if (!current) invalid('Purchase requisition not found.', 404);
  if (!['GSO Endorsed', 'Finance Handoff Pending', 'Finance Handoff Failed', 'Sent to Finance'].includes(current.status)
    || !current.gsoHeadEndorsedByUserId) {
    invalid('The GSO Head must approve the requisition before it is printed for Finance.', 409);
  }
  const financeLines = (current.purchaseLines || []).filter((line) => Number(line.financeQuantity) > 0);
  if (financeLines.length === 0) invalid('This requisition has no Finance items.', 409);
  const formData = current.formData || {};
  // The unit is on the request form, not the purchase line; the form keeps one entry per line, in line order.
  const formItems = Array.isArray(formData.items) ? formData.items : [];
  const financeItems = financeLines.map((line) => ({
    itemName: line.itemName,
    category: line.category,
    unitOfMeasure: formItems[line.lineNumber - 1]?.unitOfMeasure || '',
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
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Invalid reprint reason.');
  if (!financePdfReprintReasons.includes(input.reason)) invalid('Choose a reason for the reprint.');
  const details = input.reason === 'Other' ? text(input.details, 'Purpose', 300) : '';
  if (input.reason === 'Other' && details.length < 5) invalid('Enter the real purpose, at least 5 characters.');
  const current = await requestsRepository.getById(null, id);
  if (!current) invalid('Purchase requisition not found.', 404);
  if (current.status !== 'Sent to Finance') invalid('This requisition has not been handed off to Finance yet. Download it as the first copy first.', 409);
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
  if (!request) invalid('Request not found.', 404);
  if (request.requestType === 'PURCHASE_REQUISITION' && !purchaseRequestReadyForStaffIssuance(request)) {
    invalid('The stock for the whole request is not complete yet. No item can be issued.', 409);
  }
  return serviceWorkOrders.enrichRequest(request);
}

async function updateStatus(idValue, input, user) {
  const id = validateRequestId(idValue);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Invalid status update.');
  const status = text(input.status, 'status', 40);
  const note = text(input.note, 'review note', 2000, { optional: true });
  const current = await requestsRepository.getById(null, id);
  if (!current) invalid('Request not found.', 404);
  if (current.requestType === 'JOB_REQUEST') invalid('Job / service requests are handled from the Service Workboard.', 409);
  // Loss / damage reports move through the Loss & Damage Cases page, where a payment must be confirmed first.
  if (current.requestType === 'LOSS_DAMAGE_REPORT') invalid('Loss / damage reports are decided on the Loss & Damage Cases page.', 409);
  if (current.requestType === 'PURCHASE_REQUISITION') {
    if (current.status !== 'Approved' || status !== 'Completed') invalid('Only approved purchase requisitions can be marked Completed after issuance.', 403);
    if (!note) invalid('Enter the issuance batch reference after the issuance is recorded.');
  }
  const allowed = transitions[current.requestType]?.[current.status] || [];
  if (!allowed.includes(status)) invalid(`Status cannot change from ${current.status} to ${status}.`, 409);
  if (['Rejected', 'Needs Information'].includes(status) && !note) invalid('Add a reason or the information the requester needs.');

  // Approving a borrowing starts it right away: the approval is saved as Approved, then Issued in the same transaction.
  const activatesBorrowing = current.requestType === 'BORROWING' && status === 'Approved';
  const effectiveStatus = activatesBorrowing ? 'Issued' : status;
  let dueDate;
  // A facility release is due at the end of the event, so only a borrowing asks for a due date.
  if (effectiveStatus === 'Issued' && current.requestType === 'BORROWING') {
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

  const facilityReturns = current.requestType === 'FACILITY_USE' ? facilityFlow.prepareStatusChange(current, status, input) : null;
  // A facility release or return opened by a typed slip number instead of a scan needs a reason and is flagged
  // in the audit log (MANUAL_ENTRY, shown as "Typed code" to GSO Staff and the GSO Head), like Return Items.
  const slipStep = current.requestType === 'FACILITY_USE' && ['Approved', 'Issued'].includes(current.status)
    && ['Issued', 'Returned', 'For Repair'].includes(status);
  const typedSlip = slipStep && input.entryMethod === 'typed';
  const typedReason = typedSlip ? text(input.typedReason, 'reason for typing the slip number', 300, { optional: true }) : '';
  if (typedSlip && !typedReason) invalid('Explain why the slip number was typed instead of scanned.');

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
    facilityReturns,
  });
  // A borrowing return names the items and their recorded condition; everything else gets the standard notice.
  const returnedItems = current.requestType === 'BORROWING' && conditionsIn ? describeBorrowingReturn(current, conditionsIn) : '';
  if (returnedItems) await notifyBorrowingReturn(updated, status, returnedItems, note);
  else await notifyRequesterStatus(updated, effectiveStatus, note);
  if (current.requestType === 'FACILITY_USE') await facilityFlow.afterStatusChange(updated, effectiveStatus, facilityReturns);
  await resolveNotices(`staff-return:${id}:`, `staff-new:${id}:`, `staff-reply:${id}:`);
  await auditRequest(updated, user, {
    action: statusAuditAction[effectiveStatus] || 'updated',
    reason: returnedItems
      ? `Borrowing ${status === 'For Repair' ? 'returned for repair' : 'returned'}: ${returnedItems}.${note ? ` Note: ${note}` : ''}`
      : `${requestTypeLabels[current.requestType] || 'Request'} moved from ${current.status} to ${effectiveStatus}.${note ? ` Note: ${note}` : ''}${typedSlip ? ` Slip number typed, not scanned. Reason: ${typedReason}` : ''}`,
    oldValues: { status: current.status },
    newValues: { dueDate: dueDate || null, conditionOut, conditionIn, conditionsIn, ...(typedSlip ? { entryMethod: 'typed', typedReason } : {}) },
    flag: typedSlip ? 'MANUAL_ENTRY' : undefined,
  });
  return completeFacilityIfSettled(updated, user);
}

// A facility request closes itself once nothing is left to return or settle (user's rule, 2026-11-19).
// Approved without items closes at approval; Returned closes when no missing or damaged item is still Pending.
async function completeFacilityIfSettled(request, user) {
  if (request?.requestType !== 'FACILITY_USE') return request;
  if (request.status === 'Approved' && request.assets.length > 0) return request;
  if (!['Approved', 'Returned'].includes(request.status)) return request;
  if (request.assets.some((asset) => asset.settlementStatus === 'Pending')) return request;
  return updateStatus(request.id, { status: 'Completed' }, user);
}

// The GSO check on a Needs Repair facility item. Repaired or Unserviceable is recorded once per item. When the last
// damaged item of a request has its outcome, the request moves Returned then Completed, which releases its units.
async function resolveFacilityRepair(assetIdValue, input, user) {
  if (!/^\d+$/.test(String(assetIdValue))) invalid('Item record not found.', 404);
  const counts = ['repaired', 'unserviceable'].map((key) => Number(input?.[key] ?? 0));
  if (counts.some((count) => !Number.isInteger(count) || count < 0)) invalid('Enter whole numbers, 0 or more.');
  if (counts[0] + counts[1] === 0) invalid('Enter how many were repaired or unserviceable.');
  // An unserviceable unit needs a reason and a waive-or-charge decision. The estimate is shown to the requester.
  let writeOff = null;
  if (counts[1] > 0) {
    const reason = String(input?.writeOffReason || '').trim();
    const decision = input?.writeOffDecision;
    if (!reason) invalid('Write down why the unserviceable units cannot be fixed.');
    if (reason.length > 300) invalid('The reason must be 300 characters or fewer.');
    if (!['WAIVED', 'CHARGED'].includes(decision)) invalid('Choose whether the write-off is waived or charged to the requester.');
    const estimatedValue = input?.writeOffEstimatedValue == null ? null : Number(input.writeOffEstimatedValue);
    if (estimatedValue !== null && (!Number.isFinite(estimatedValue) || estimatedValue < 0)) invalid('The estimated value must be 0 or more.');
    writeOff = { reason, decision, estimatedValue };
  }
  const row = await facilityRepository.recordRepairCounts({ assetId: String(assetIdValue), repaired: counts[0], unserviceable: counts[1], userId: user.id, writeOff });
  if (!row) invalid('These counts are more than the units still waiting for a check.', 409);
  if (row.repairOwner === 'ITSS') {
    const parts = [counts[0] && `${counts[0]} repaired`, counts[1] && `${counts[1]} unserviceable`].filter(Boolean).join(', ');
    await sideEffect('ITSS repair notice', () => notificationsRepository.createRoleNotification({
      roleKey: 'GSO_STAFF',
      type: 'REQUEST',
      title: 'ITSS finished a repair check',
      message: `${row.unit}: ITSS checked the returned items: ${parts}.`,
      href: `/gso/facility-requests?request=${encodeURIComponent(row.requestId)}`,
      dedupeKey: `facility-itss-outcome:${assetIdValue}:${Date.now()}`,
    }));
  }
  if (writeOff?.decision === 'CHARGED') {
    const request = await requestsRepository.getById(null, row.requestId);
    if (request?.requesterId) {
      const value = writeOff.estimatedValue === null ? '' : ` Estimated value: ₱${writeOff.estimatedValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}.`;
      await sideEffect('Requester notification', () => notificationsRepository.createUserNotification({
        userId: request.requesterId,
        type: 'REQUEST',
        title: 'Payment needed for a damaged item',
        message: `${request.referenceNo}: ${counts[1]} ${row.unit} of an item you borrowed came back unserviceable (${writeOff.reason}).${value} Please pay at the Finance office in person.`,
        href: `/requester/requests/${request.id}`,
        dedupeKey: `facility-writeoff:${assetIdValue}:${counts[1]}:${Date.now()}`,
      }));
    }
  }
  if ((await facilityRepository.countOpenRepairs(row.requestId)) === 0) {
    const note = 'GSO finished the repair check for the returned items.';
    // Returned closes the request by itself when nothing is left pending (completeFacilityIfSettled).
    await updateStatus(row.requestId, { status: 'Returned', note }, user);
  }
  return requestsRepository.getById(null, row.requestId);
}

module.exports = {
  resolveFacilityRepair,
  listAssets,
  listPurchaseItemNames,
  createRequest,
  listRequesterDepartmentStaff,
  listMine,
  listMyActivity,
  getMine,
  cancelMine,
  respondMine,
  confirmServiceMine,
  reopenServiceMine,
  requestReturn,
  listAll,
  listPurchaseRequisitions,
  listStaffPurchaseRequisitions,
  listItemsToBuy,
  staffReviewPurchaseRequisition,
  getStaffPurchaseRequisitionForIssuance,
  listAwaitingPurchaseDeliveries,
  recordPurchaseDeliveries,
  swapRequisitionUnit,
  autoReserveReceivedPurchaseStock,
  undoPurchaseDelivery,
  reviewPurchaseRequisition,
  handPurchaseRequisitionToFinance,
  getFinancePdf,
  logFinancePdfReprint,
  getForGso,
  updateStatus,
  completeFacilityIfSettled,
};
