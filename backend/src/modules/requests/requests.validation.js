const { SERVICE_CATEGORIES, routeForCategory, priorityForService } = require('./service-work-order.constants');
const { validatePhotos } = require('./service-work-orders.validation');

const REQUEST_TYPES = new Set([
  'BORROWING',
  'FACILITY_USE',
  'JOB_REQUEST',
  'PURCHASE_REQUISITION',
  'LOSS_DAMAGE_REPORT',
  'ISSUANCE_REQUEST',
]);

const PURCHASE_CATEGORIES = new Set([
  'OFFICE_SUPPLIES',
  'OFFICE_EQUIPMENT',
  'MACHINERY_PARTS',
  'COMPUTER_PERIPHERALS',
  'TOOLS_EQUIPMENT',
  'ELECTRICAL_SUPPLIES',
  'OTHER_CONSUMABLES',
  'OTHER',
  'PUBLICATIONS',
]);

// A consumable is used up, so its request needs no purpose; a per-unit item keeps every check.
const ITEM_KINDS = new Set(['CONSUMABLE', 'PER_UNIT']);

const PLANNED_DISTRIBUTION_DESTINATIONS = new Set([
  'employee',
  'department_location',
]);

function invalid(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function text(value, label, max = 500, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim()) invalid(`${label} is required.`);
  const normalized = value.trim();
  if (normalized.length > max) invalid(`${label} must be ${max} characters or less.`);
  return normalized;
}

function date(value, label, { optional = false, notPast = false, notFuture = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`Invalid ${label}.`);
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    invalid(`Invalid ${label}.`);
  }
  if (notPast) {
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (value < todayIso) invalid(`${label} cannot be in the past.`);
  }
  if (notFuture) {
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (value > todayIso) invalid(`${label} cannot be in the future.`);
  }
  return value;
}

function integer(value, label, { optional = false, minimum = 0, maximum = 100000 } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) invalid(`${label} must be a whole number of ${minimum} or more.`);
  return number;
}

function requireItems(value) {
  if (!Array.isArray(value) || value.length === 0) invalid('Pick at least one item issued to you.');
  return value;
}

function rows(value, label, mapper, { min = 1, max = 30 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    invalid(`${label}: enter ${min}${max > min ? ` to ${max}` : ''} row(s).`);
  }
  return value.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) invalid(`${label} has an invalid row.`);
    return mapper(row);
  });
}

function validateCreateRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Invalid request details.');
  const requestType = text(input.requestType, 'request type', 40).toUpperCase();
  if (!REQUEST_TYPES.has(requestType)) invalid('This request type is not available yet.');
  const data = input.formData;
  if (!data || typeof data !== 'object' || Array.isArray(data)) invalid('Invalid form details.');

  if (requestType === 'BORROWING') {
    const items = rows(data.items, 'Borrowing items', (row) => {
      const rawId = String(row.itemId ?? '');
      if (!/^\d{1,20}$/.test(rawId)) invalid('Choose a valid item from inventory.');
      return { itemId: rawId, quantity: integer(row.quantity, 'Quantity', { minimum: 1, maximum: 2147483647 }) };
    }, { max: 25 });
    if (new Set(items.map((item) => item.itemId)).size !== items.length) invalid('Remove the duplicate inventory item.');
    const neededDate = date(data.neededDate, 'needed date', { notPast: true });
    const returnDate = date(data.returnDate, 'expected return date', { notPast: true });
    if (returnDate < neededDate) invalid('The return date must be the same as or after the needed date.');
    const purposeOption = text(data.purpose, 'purpose', 100);
    const purpose = purposeOption === 'Other' ? `Other: ${text(data.otherPurpose, 'specific purpose', 1900)}` : purposeOption;
    const useLocation = data.specificLocation !== undefined
      ? `${text(data.useLocation, 'place of use', 60)} — ${text(data.specificLocation, 'specific room or location', 210)}`
      : text(data.useLocation, 'place of use', 250);
    const returnResponsibleContact = text(data.returnResponsibleContact, 'return contact number', 40);
    if (!/^[+0-9().\s-]+$/.test(returnResponsibleContact) || returnResponsibleContact.replace(/\D/g, '').length < 7) {
      invalid('Enter a valid return contact number.');
    }
    return {
      requestType,
      formData: {
        purpose,
        neededDate,
        returnDate,
        useLocation,
        returnResponsibleName: text(data.returnResponsibleName, 'return responsible person', 200),
        returnResponsibleContact,
        remarks: text(data.remarks, 'remarks', 2000, { optional: true }),
        items,
      },
    };
  }

  if (requestType === 'FACILITY_USE') {
    const activityType = text(data.activityType, 'activity type', 30).toUpperCase();
    if (!['CURRICULAR', 'CO_CURRICULAR', 'OTHER'].includes(activityType)) invalid('Choose a valid nature of activity.');
    const startTime = text(data.startTime, 'start time', 5);
    const endTime = text(data.endTime, 'end time', 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || endTime <= startTime) {
      invalid('Enter a valid time. The end time must be after the start time.');
    }
    // Equipment is picked from the Item Master. The server fills in each record's name, code, description and unit.
    const equipment = rows(data.equipment || [], 'Equipment list', (row) => {
      const rawId = String(row.itemId ?? '');
      if (!/^\d{1,20}$/.test(rawId)) invalid('Choose an item from the list.');
      return { itemId: rawId, quantity: integer(row.quantity, 'equipment quantity', { minimum: 1 }) };
    }, { min: 0, max: 30 });
    if (new Set(equipment.map((row) => row.itemId)).size !== equipment.length) invalid('Each item can only be listed once.');
    // One number for everyone taking part (male and female counts were dropped on 2026-11-15); an estimate is fine.
    const participants = data.participants === undefined || data.participants === null || data.participants === '' ? null : Number(data.participants);
    if (participants !== null && (!Number.isInteger(participants) || participants < 1 || participants > 100000)) {
      invalid('Enter the number of participants as a whole number of at least 1.');
    }
    return {
      requestType,
      formData: {
        departmentOrganization: text(data.departmentOrganization, 'department/organization', 200),
        activity: text(data.activity, 'activity', 300),
        purpose: text(data.purpose, 'purpose', 2000),
        activityType,
        otherActivityType: activityType === 'OTHER' ? text(data.otherActivityType, 'activity type details', 200) : '',
        date: date(data.date, 'facility date', { notPast: true }),
        startTime,
        endTime,
        participants,
        venue: text(data.venue, 'venue', 200),
        equipment,
      },
    };
  }

  if (requestType === 'JOB_REQUEST') {
    // The category decides the receiving team and the starting priority. The client's values are never trusted.
    const serviceCategory = text(data.serviceCategory, 'service category', 60);
    if (!SERVICE_CATEGORIES.has(serviceCategory)) invalid('Choose a valid service category.');
    const requiredDate = date(data.requiredDate, 'target date', { notPast: true });
    // "Others" needs the requester to say what the service is. The text is ignored for every other category.
    const serviceOther = serviceCategory === 'OTHERS' ? text(data.serviceOther, 'description of the service', 200) : '';
    return {
      requestType,
      formData: {
        departmentOrganization: text(data.departmentOrganization, 'department/area', 200),
        location: text(data.location, 'location / room', 200),
        serviceCategory,
        serviceOther,
        serviceRoute: routeForCategory(serviceCategory),
        servicePriority: priorityForService({ category: serviceCategory, targetDate: requiredDate }),
        purpose: text(data.purpose, 'purpose', 2000),
        requiredDate,
        // Work items are optional now: the requester form no longer asks for them, and staff track the job itself.
        tasks: rows(data.tasks ?? [], 'Job particulars', (row) => ({
          quantity: integer(row.quantity, 'task quantity', { minimum: 1 }),
          particulars: text(row.particulars, 'particulars', 300),
          natureOfWork: text(row.natureOfWork, 'description/nature of work', 1000),
          remarks: text(row.remarks, 'task remarks', 500, { optional: true }),
        }), { min: 0, max: 30 }),
        remarks: text(data.remarks, 'remarks', 2000, { optional: true }),
        // Optional photos of the problem, such as a broken projector or a Wi-Fi error screen.
        photos: validatePhotos(data.photos),
      },
    };
  }

  if (requestType === 'PURCHASE_REQUISITION') {
    if (data.requesterCertification !== true) invalid('Confirm first that the details are correct and that your department needs this request.');
    const requiredDate = date(data.requiredDate, 'required date', { notPast: true });
    const urgency = data.urgency === 'Urgent' ? 'Urgent' : 'Standard';
    const urgentReason = text(data.urgentReason, 'urgent reason', 500, { optional: urgency !== 'Urgent' });
    if (urgency === 'Urgent' && !urgentReason) invalid('Explain why the request is needed right away.');
    const items = rows(data.items, 'Purchase items', (row) => {
      const category = text(row.category, 'requisition category', 60).toUpperCase();
      if (!PURCHASE_CATEGORIES.has(category)) invalid('Choose a valid requisition category.');
      const catalogItemId = integer(row.catalogItemId, 'catalog item id', { optional: true, minimum: 1 });
      const itemNameId = integer(row.itemNameId, 'saved item name id', { optional: true, minimum: 1 });
      if (catalogItemId !== null && itemNameId !== null) invalid('Choose only one saved item source.');
      // Older payloads without a kind count as per unit, so they keep the full checks.
      const itemKind = row.itemKind === undefined || row.itemKind === null || row.itemKind === ''
        ? 'PER_UNIT'
        : String(row.itemKind).trim().toUpperCase();
      if (!ITEM_KINDS.has(itemKind)) invalid('Choose whether each item is a consumable or per unit.');
      // A consumable is counted in the unit it is bought in; a per-unit item is counted in pieces.
      const unitOfMeasure = itemKind === 'CONSUMABLE' ? text(row.unitOfMeasure, 'unit of measure', 40) : 'piece';
      const quantity = integer(row.quantity, 'item quantity', { minimum: 1 });
      // A consumable has no room assignment; GSO issues it to the requester by default.
      const plannedRecipients = itemKind === 'CONSUMABLE' ? [] : rows(row.plannedRecipients, 'item assignments', (recipient) => {
        // Older payloads may omit the destination type; treat those as employee assignments.
        const destinationType = recipient.destinationType === undefined || recipient.destinationType === null || recipient.destinationType === ''
          ? 'employee'
          : text(recipient.destinationType, 'assignment destination type', 40).toLowerCase();
        if (!PLANNED_DISTRIBUTION_DESTINATIONS.has(destinationType)) {
          invalid('Choose an employee or a designated room as the destination.');
        }

        const plannedRecipient = {
          destinationType,
          quantity: integer(recipient.quantity, 'assigned quantity', { minimum: 1 }),
          purpose: text(recipient.purpose, 'recipient purpose', 500, { optional: true }),
          employeeCode: '',
          useLocation: '',
          building: '',
          room: '',
        };

        if (destinationType === 'employee') {
          return {
            ...plannedRecipient,
            employeeCode: text(recipient.employeeCode, 'recipient employee code', 40),
            useLocation: text(recipient.useLocation, 'recipient use location', 200),
          };
        }

        if (destinationType === 'department_location') {
          const building = text(recipient.building, 'building or unit', 80);
          const room = text(recipient.room, 'room or shared area', 100);
          const useLocation = `${building} — ${room}`;
          if (useLocation.length > 200) invalid('recipient use location must be 200 characters or less.');
          return {
            ...plannedRecipient,
            building,
            room,
            useLocation,
          };
        }

        invalid('Choose an employee or a designated room as the destination.');
      }, { min: 1, max: 50 });
      const recipientKeys = plannedRecipients.map((recipient) => {
        if (recipient.destinationType === 'employee') return `employee:${recipient.employeeCode.trim().toLowerCase()}`;
        return `${recipient.destinationType}:${recipient.useLocation.trim().toLowerCase()}:${recipient.purpose.trim().toLowerCase()}`;
      });
      if (new Set(recipientKeys).size !== recipientKeys.length) {
        invalid('Put the same planned destination in one allocation row.');
      }
      const assignedQuantity = plannedRecipients.reduce((sum, recipient) => sum + recipient.quantity, 0);
      if (assignedQuantity > quantity) {
        invalid('The planned recipient allocation cannot be more than the requested quantity.');
      }
      if (itemKind !== 'CONSUMABLE' && assignedQuantity !== quantity) {
        invalid('Assign the full requested quantity to an employee or a designated room before you submit the requisition.');
      }
      return {
        quantity,
        category,
        catalogItemId,
        itemNameId,
        itemKind,
        unitOfMeasure,
        itemName: text(row.itemName, 'item name', 250),
        description: text(row.description, 'item description/specifications', 1000),
        plannedRecipients,
      };
    }, { max: 30 });
    const uniqueLineKeys = new Set();
    for (const item of items) {
      const lineKey = `${item.category}|${item.itemName.trim().toLowerCase()}`;
      if (uniqueLineKeys.has(lineKey)) invalid('Put the same item in one row so the stock reservation is correct.');
      uniqueLineKeys.add(lineKey);
    }
    // A consumable-only request has no purpose; a request with a per-unit item still needs one.
    // A request holds either consumables or per-unit items, never both.
    if (new Set(items.map((item) => item.itemKind)).size > 1) invalid('A request holds either consumables or per-unit items. Submit them as separate requests.');
    const consumableOnly = items.every((item) => item.itemKind === 'CONSUMABLE');
    return {
      requestType,
      formData: {
        purpose: text(data.purpose, 'purpose of request', 2000, { optional: consumableOnly }),
        requiredDate,
        urgency,
        urgentReason,
        items,
        remarks: text(data.remarks, 'remarks', 2000, { optional: true }),
      },
    };
  }

  if (requestType === 'ISSUANCE_REQUEST') {
    return {
      requestType,
      formData: {
        purpose: text(data.purpose, 'purpose', 2000),
        neededDate: date(data.neededDate, 'needed date', { notPast: true }),
        items: rows(data.items, 'Requested items', (row) => ({
          quantity: integer(row.quantity, 'item quantity', { minimum: 1 }),
          description: text(row.description, 'item description/specifications', 1000),
        }), { max: 30 }),
        remarks: text(data.remarks, 'remarks', 2000, { optional: true }),
      },
    };
  }

  const incidentType = text(data.incidentType, 'incident type', 20).toUpperCase();
  if (!['LOST', 'DAMAGED'].includes(incidentType)) invalid('Choose whether the incident is Lost or Damaged.');
  return {
    requestType,
    formData: {
      incidentType,
      keyArea: text(data.keyArea, 'key area/location', 200),
      incidentDate: date(data.incidentDate, 'incident date', { notFuture: true }),
      responsiblePerson: text(data.responsiblePerson, 'reported/responsible person', 200),
      // Items come from the requester's issued list. The server checks each one and copies its name and code
      // (reportedIssuedRows in requests.repository.js), so an item that was not issued to them cannot be reported.
      items: rows(requireItems(data.items), 'Incident items', (row) => {
        const issuanceId = String(row.issuanceId ?? '');
        if (!/^\d{1,20}$/.test(issuanceId)) invalid('Pick the items issued to you from the list.');
        if (row.identityUnknown !== undefined && typeof row.identityUnknown !== 'boolean') invalid('Choose whether you know the exact unit.');
        const identityUnknown = row.identityUnknown === true;
        const tagCode = text(row.tagCode, 'unit barcode', 100, { optional: true });
        // A lost or damaged unit without a picked asset tag is left for GSO to identify.
        if (identityUnknown && tagCode) invalid('A unit with a selected asset tag cannot be marked as unidentified.');
        return {
          issuanceId,
          tagCode,
          quantity: integer(row.quantity, 'item quantity', { minimum: 1 }),
          identityUnknown,
          remarks: text(row.remarks, 'item remarks', 500, { optional: true }),
        };
      }, { max: 30 }),
      remarks: text(data.remarks, 'remarks', 2000, { optional: true }),
    },
  };
}

function validateRequestId(value) {
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value)) invalid('Invalid request reference.', 404);
  return value;
}

function validateRequestFilters(query) {
  const requestType = query.type ? text(query.type, 'request type', 40).toUpperCase() : '';
  if (requestType && !REQUEST_TYPES.has(requestType)) invalid('Invalid request type filter.');
  const status = query.status ? text(query.status, 'status', 40) : '';
  const search = query.search ? text(query.search, 'search', 100) : '';
  return { requestType, status, search };
}

module.exports = { REQUEST_TYPES, invalid, text, validateCreateRequest, validateRequestId, validateRequestFilters };
