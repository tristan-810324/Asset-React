const nodemailer = require('nodemailer');
const env = require('../../config/env');
const requestsRepository = require('./requests.repository');
const requesterIdentityRepository = require('../requester-identity/requester-identity.repository');
const { normalizeEmail } = require('../auth/auth.validation');
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
  'Submitted', 'Under Review', 'Needs Information', 'Rejected', 'GSO Endorsed',
  'Finance Handoff Pending', 'Finance Handoff Failed', 'Sent to Finance', 'Finance Response Recorded',
]);
const financeDecisions = new Set(['Approved', 'Needs Changes', 'Rejected']);

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
  if (!mailTransport || !request?.requesterEmail) return false;
  const messages = {
    'Needs Information': `The GSO Head needs more information. Sign in to A.S.SET and reply to this requisition.${note ? ` Details: ${note}` : ''}`,
    Rejected: `The GSO Head rejected this requisition.${note ? ` Reason: ${note}` : ''}`,
    'GSO Endorsed': 'The GSO Head endorsed this requisition. The next step is the Finance handoff.',
    'Sent to Finance': `The GSO Head sent this requisition to Finance at ${request.financeEmail || 'the recorded Finance address'}. Wait for the external Finance response.`,
    'Finance Response Recorded': `Finance responded: ${request.financeDecision || 'see the request details'}.${note ? ` ${note}` : ''}`,
  };
  const message = messages[status];
  if (!message) return null;
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

async function createRequest(input, user) {
  if (!(await requesterIdentityRepository.isVerified(user.id))) {
    invalid('Kumpletuhin ang requester identity profile at hintayin ang pag-verify ng GSO bago magsumite ng request.', 403);
  }
  const validated = validateCreateRequest(input);
  if (validated.requestType === 'PURCHASE_REQUISITION') {
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
      };
    });
    const employee = await requesterIdentityRepository.getVerifiedEmployeeSummary(user.id);
    if (!employee) invalid('Hindi makita ang aktibong verified employee record. Makipag-ugnayan sa GSO.', 403);
    const staffCodes = [...new Set(validated.formData.items.flatMap((item) => item.intendedStaffCodes))];
    const departmentStaff = staffCodes.length
      ? await requesterIdentityRepository.listVerifiedDepartmentEmployees(user.id)
      : [];
    const staffByCode = new Map(departmentStaff.map((staff) => [String(staff.employeeCode).toLowerCase(), staff]));
    for (const code of staffCodes) {
      if (!staffByCode.has(code.toLowerCase())) {
        invalid('Pumili lamang ng aktibong staff mula sa verified department mo.');
      }
    }
    validated.formData = {
      ...validated.formData,
      departmentOrganization: employee.department,
      requesterEmployeeCode: employee.employeeCode,
      requesterName: employee.employeeName,
      requesterPosition: employee.position,
      requesterAttestedAt: new Date().toISOString(),
      items: validated.formData.items.map((item) => ({
        quantity: item.quantity,
        category: item.category,
        catalogItemId: item.catalogItemId,
        catalogItemCode: item.catalogItemCode || null,
        catalogCategory: item.catalogCategory || null,
        itemName: item.itemName,
        description: item.description,
        intendedStaff: item.intendedStaffCodes.map((code) => {
          const staff = staffByCode.get(code.toLowerCase());
          return {
            employeeCode: staff.employeeCode,
            employeeName: staff.employeeName,
            email: staff.email,
            position: staff.position,
          };
        }),
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
  if (!['Submitted', 'Needs Information'].includes(current.status)) {
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
  return requestsRepository.listPurchaseRequisitions({ status, search });
}

async function reviewPurchaseRequisition(idValue, input, user) {
  const id = validateRequestId(idValue);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Hindi valid ang purchase requisition decision.');
  const status = text(input.status, 'status', 40);
  const note = text(input.note, 'review note', 2000, { optional: true });
  if (!['Under Review', 'Needs Information', 'Rejected', 'GSO Endorsed'].includes(status)) {
    invalid('Pumili ng review, request for information, reject, o endorse action.');
  }
  if (['Needs Information', 'Rejected'].includes(status) && !note) {
    invalid('Maglagay ng dahilan o impormasyong kailangan bago magpatuloy.');
  }
  const request = await requestsRepository.reviewPurchaseRequisition({ id, status, note, changedBy: user.id });
  const requesterNotified = await notifyPurchaseRequester(request, status, note);
  return { request, requesterNotified };
}

async function sendPurchaseRequisitionToFinance(idValue, input, user) {
  const id = validateRequestId(idValue);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Hindi valid ang Finance handoff request.');
  const financeEmail = normalizeEmail(input.financeEmail);
  if (!mailTransport) invalid('Hindi naka-configure ang GSO email service. I-configure muna ang SMTP bago magpadala sa Finance.', 503);

  const request = await requestsRepository.beginFinanceHandoff({ id, financeEmail, changedBy: user.id });
  const formData = request.formData || {};
  const requestedItems = Array.isArray(formData.items) ? formData.items : [];
  const itemLines = requestedItems.map((item, index) =>
    `${index + 1}. ${item.itemName || 'General item'}${item.catalogItemCode ? ` (${item.catalogItemCode})` : ''}\n   Category: ${item.category || 'Not specified'}\n   Quantity: ${item.quantity}\n   Specifications: ${item.description}\n   Planned staff: ${(item.intendedStaff || []).map((staff) => staff.employeeName).join(', ') || 'To be assigned during Main Issuance'}`
  ).join('\n');
  const textBody = [
    'Good day, Finance Team,',
    '',
    'The GSO Head has endorsed the following purchase requisition for Finance review.',
    '',
    `Reference: ${request.referenceNo}`,
    `EmployeeHead/requester: ${formData.requesterName || request.requesterName}`,
    `Employee code: ${formData.requesterEmployeeCode || '—'}`,
    `Department: ${formData.departmentOrganization || '—'}`,
    `Position: ${formData.requesterPosition || '—'}`,
    `Date needed: ${formData.requiredDate || '—'}`,
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
    'This requisition was sent from A.S.SET. Please reply to this email with the Finance decision or reference.',
  ].join('\n');

  let sent;
  try {
    sent = await mailTransport.sendMail({
      from: env.smtp.from,
      to: financeEmail,
      replyTo: user.email,
      subject: `Purchase requisition ${request.referenceNo} — GSO Head endorsement`,
      text: textBody,
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
  return { request: completedRequest, requesterNotified };
}

async function recordFinanceResponse(idValue, input, user) {
  const id = validateRequestId(idValue);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Hindi valid ang Finance response.');
  const decision = text(input.decision, 'Finance decision', 40);
  if (!financeDecisions.has(decision)) invalid('Pumili ng Approved, Needs Changes, o Rejected na Finance response.');
  const reference = text(input.reference, 'Finance reference', 200, { optional: true });
  const note = text(input.note, 'Finance response note', 2000, { optional: true });
  if (decision !== 'Approved' && !note) invalid('Maglagay ng detalye kapag Needs Changes o Rejected ang sagot ng Finance.');
  const historyNote = `Finance response recorded: ${decision}${reference ? ` (${reference})` : ''}. ${note}`.slice(0, 2000);
  const request = await requestsRepository.recordFinanceResponse({ id, decision, reference, note, historyNote, changedBy: user.id });
  const requesterNotified = await notifyPurchaseRequester(request, 'Finance Response Recorded', note);
  return { request, requesterNotified };
}

async function getForGso(idValue) {
  const request = await requestsRepository.getById(null, validateRequestId(idValue));
  if (!request) invalid('Hindi makita ang request.', 404);
  if (request.requestType === 'PURCHASE_REQUISITION') invalid('Purchase requisitions are handled in the GSO Head workspace.', 404);
  return request;
}

async function updateStatus(idValue, input, user) {
  const id = validateRequestId(idValue);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Hindi valid ang status update.');
  const status = text(input.status, 'status', 40);
  const note = text(input.note, 'review note', 2000, { optional: true });
  const current = await requestsRepository.getById(null, id);
  if (!current) invalid('Hindi makita ang request.', 404);
  if (current.requestType === 'PURCHASE_REQUISITION') invalid('Purchase requisitions may only be reviewed by the GSO Head.', 403);
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
  createRequest,
  listRequesterDepartmentStaff,
  listMine,
  getMine,
  cancelMine,
  respondMine,
  requestReturn,
  listAll,
  listPurchaseRequisitions,
  reviewPurchaseRequisition,
  sendPurchaseRequisitionToFinance,
  recordFinanceResponse,
  getForGso,
  updateStatus,
};
