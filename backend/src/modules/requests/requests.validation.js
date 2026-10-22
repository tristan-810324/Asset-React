const REQUEST_TYPES = new Set([
  'BORROWING',
  'FACILITY_USE',
  'JOB_REQUEST',
  'PURCHASE_REQUISITION',
  'LOSS_DAMAGE_REPORT',
]);

const PURCHASE_CATEGORIES = new Set([
  'Office Supplies',
  'Office Equipment',
  'Machineries / Parts',
  'Computer Parts / Peripherals',
  'Tools / Equipment',
  'Publications',
  'Electrical Supplies',
  'Other Consumables',
  'Others',
]);

function invalid(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function text(value, label, max = 500, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim()) invalid(`${label} ay kailangan.`);
  const normalized = value.trim();
  if (normalized.length > max) invalid(`${label} ay hindi dapat lumampas sa ${max} characters.`);
  return normalized;
}

function date(value, label, { optional = false, notPast = false, notFuture = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`Hindi valid ang ${label}.`);
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    invalid(`Hindi valid ang ${label}.`);
  }
  if (notPast) {
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (value < todayIso) invalid(`${label} ay hindi maaaring nasa nakaraan.`);
  }
  if (notFuture) {
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (value > todayIso) invalid(`${label} ay hindi maaaring nasa hinaharap.`);
  }
  return value;
}

function integer(value, label, { optional = false, minimum = 0, maximum = 100000 } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) invalid(`${label} ay dapat whole number na ${minimum} o higit pa.`);
  return number;
}

function rows(value, label, mapper, { min = 1, max = 30 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    invalid(`${label}: maglagay ng ${min}${max > min ? ` hanggang ${max}` : ''} row.`);
  }
  return value.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) invalid(`May hindi valid na row sa ${label}.`);
    return mapper(row);
  });
}

function validateCreateRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Hindi valid ang request details.');
  const requestType = text(input.requestType, 'request type', 40).toUpperCase();
  if (!REQUEST_TYPES.has(requestType)) invalid('Hindi pa available ang request type na ito.');
  const data = input.formData;
  if (!data || typeof data !== 'object' || Array.isArray(data)) invalid('Hindi valid ang form details.');

  if (requestType === 'BORROWING') {
    const items = rows(data.items, 'Borrowing items', (row) => {
      const rawId = String(row.itemId ?? '');
      if (!/^\d{1,20}$/.test(rawId)) invalid('Pumili ng valid na item sa inventory.');
      return { itemId: rawId, quantity: integer(row.quantity, 'Quantity', { minimum: 1, maximum: 2147483647 }) };
    }, { max: 25 });
    if (new Set(items.map((item) => item.itemId)).size !== items.length) invalid('Alisin ang nadobleng inventory item.');
    const neededDate = date(data.neededDate, 'needed date', { notPast: true });
    const returnDate = date(data.returnDate, 'expected return date', { notPast: true });
    if (returnDate < neededDate) invalid('Ang return date ay dapat kapareho o lampas sa needed date.');
    return {
      requestType,
      formData: {
        purpose: text(data.purpose, 'purpose', 2000),
        neededDate,
        returnDate,
        pickupLocation: text(data.pickupLocation, 'pickup location', 250, { optional: true }),
        remarks: text(data.remarks, 'remarks', 2000, { optional: true }),
        items,
      },
    };
  }

  if (requestType === 'FACILITY_USE') {
    const activityType = text(data.activityType, 'activity type', 30).toUpperCase();
    if (!['CURRICULAR', 'CO_CURRICULAR', 'OTHER'].includes(activityType)) invalid('Pumili ng valid na activity type.');
    const startTime = text(data.startTime, 'start time', 5);
    const endTime = text(data.endTime, 'end time', 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || endTime <= startTime) {
      invalid('Tiyaking valid at mas huli sa start time ang end time.');
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
        participantsMale: integer(data.participantsMale, 'male participants', { optional: true }),
        participantsFemale: integer(data.participantsFemale, 'female participants', { optional: true }),
        venue: text(data.venue, 'venue', 200),
        equipment: rows(data.equipment || [], 'Equipment list', (row) => ({
          name: text(row.name, 'equipment name', 200),
          quantity: integer(row.quantity, 'equipment quantity', { minimum: 1 }),
          unit: text(row.unit, 'equipment unit', 40, { optional: true }) || 'pcs',
        }), { min: 0, max: 30 }),
        remarks: text(data.remarks, 'remarks', 2000, { optional: true }),
      },
    };
  }

  if (requestType === 'JOB_REQUEST') {
    return {
      requestType,
      formData: {
        departmentOrganization: text(data.departmentOrganization, 'department/area', 200),
        purpose: text(data.purpose, 'purpose', 2000),
        requiredDate: date(data.requiredDate, 'required date', { notPast: true }),
        tasks: rows(data.tasks, 'Job particulars', (row) => ({
          quantity: integer(row.quantity, 'task quantity', { minimum: 1 }),
          particulars: text(row.particulars, 'particulars', 300),
          natureOfWork: text(row.natureOfWork, 'description/nature of work', 1000),
          remarks: text(row.remarks, 'task remarks', 500, { optional: true }),
        }), { max: 30 }),
        remarks: text(data.remarks, 'remarks', 2000, { optional: true }),
      },
    };
  }

  if (requestType === 'PURCHASE_REQUISITION') {
    const requiredDate = date(data.requiredDate, 'required date', { notPast: true });
    const [year, month, day] = requiredDate.split('-').map(Number);
    const minimumDate = new Date();
    minimumDate.setHours(0, 0, 0, 0);
    minimumDate.setDate(minimumDate.getDate() + 14);
    const requested = new Date(year, month - 1, day);
    if (requested < minimumDate) invalid('Ayon sa form, magsumite ng purchase requisition nang hindi bababa sa dalawang linggo bago ang required date.');
    const category = text(data.category, 'supplier category', 80);
    if (!PURCHASE_CATEGORIES.has(category)) invalid('Pumili ng valid na supplier category.');
    return {
      requestType,
      formData: {
        departmentOrganization: text(data.departmentOrganization, 'department/office/area', 200),
        category,
        purpose: text(data.purpose, 'purpose of request', 2000),
        requiredDate,
        items: rows(data.items, 'Purchase items', (row) => ({
          quantity: integer(row.quantity, 'item quantity', { minimum: 1 }),
          description: text(row.description, 'item description/specifications', 1000),
        }), { max: 30 }),
      },
    };
  }

  const incidentType = text(data.incidentType, 'incident type', 20).toUpperCase();
  if (!['LOST', 'DAMAGED'].includes(incidentType)) invalid('Pumili kung Lost o Damaged ang incident.');
  return {
    requestType,
    formData: {
      incidentType,
      keyArea: text(data.keyArea, 'key area/location', 200),
      incidentDate: date(data.incidentDate, 'incident date', { notFuture: true }),
      responsiblePerson: text(data.responsiblePerson, 'reported/responsible person', 200),
      items: rows(data.items, 'Incident items', (row) => ({
        quantity: integer(row.quantity, 'item quantity', { minimum: 1 }),
        description: text(row.description, 'item/description', 500),
        assetCode: text(row.assetCode, 'asset/control number', 100, { optional: true }),
        remarks: text(row.remarks, 'item remarks', 500, { optional: true }),
      }), { max: 30 }),
      remarks: text(data.remarks, 'remarks', 2000, { optional: true }),
    },
  };
}

function validateRequestId(value) {
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value)) invalid('Hindi valid ang request reference.', 404);
  return value;
}

function validateRequestFilters(query) {
  const requestType = query.type ? text(query.type, 'request type', 40).toUpperCase() : '';
  if (requestType && !REQUEST_TYPES.has(requestType)) invalid('Hindi valid ang request type filter.');
  const status = query.status ? text(query.status, 'status', 40) : '';
  const search = query.search ? text(query.search, 'search', 100) : '';
  return { requestType, status, search };
}

module.exports = { REQUEST_TYPES, PURCHASE_CATEGORIES, invalid, text, validateCreateRequest, validateRequestId, validateRequestFilters };
