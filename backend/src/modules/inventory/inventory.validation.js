const conditions = new Set([
  'New',
  'Good',
  'Fair',
  'Needs Repair',
  'Under Maintenance',
  'Unserviceable',
  'Retired',
]);

function invalid(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function requiredText(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim()) {
    invalid(`${label} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    invalid(`${label} must be ${maxLength} characters or less.`);
  }
  return normalized;
}

function optionalText(value, label, maxLength) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') invalid(`${label} must be text.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) invalid(`${label} must be ${maxLength} characters or less.`);
  return normalized;
}

function optionalDate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalid('Invalid date of acquisition.');
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    invalid('Invalid date of acquisition.');
  }
  return value;
}

function optionalTime(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    invalid('Invalid time of acquisition.');
  }
  return value;
}

function nonnegativeAmount(value, label, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 9999999999.99) {
    invalid(`${label} must be valid and not negative.`);
  }
  return Math.round(amount * 100) / 100;
}

function nonnegativeInteger(value, label, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 2147483647) {
    invalid(`${label} must be a whole number and not negative.`);
  }
  return quantity;
}

function validateCreateInventoryItem(input) {
  return validateInventoryItem(input, false);
}

function validateCreateInventoryItems(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.items)) {
    invalid('Invalid list of inventory items.');
  }
  if (input.items.length < 1 || input.items.length > 500) {
    invalid('Save 1 to 500 individual items per batch.');
  }

  const items = input.items.map(validateCreateInventoryItem);
  if (items.some((item) => item.quantity !== 1 || item.trackingMode !== 'individual')) {
    invalid('Each record in the batch must be for one item only.');
  }

  const itemCodes = new Set();
  const serialNumbers = new Set();
  for (const item of items) {
    const normalizedCode = item.itemCode.toLowerCase();
    if (itemCodes.has(normalizedCode)) {
      invalid('Each individual item must have a unique Item Code.');
    }
    itemCodes.add(normalizedCode);
    const normalizedSerial = item.serialNumber.toLowerCase();
    if (normalizedSerial && serialNumbers.has(normalizedSerial)) {
      invalid('Each manufacturer serial number must be unique.');
    }
    if (normalizedSerial) serialNumbers.add(normalizedSerial);
  }

  return items;
}

function validateUpdateInventoryItem(input) {
  return validateInventoryItem(input, true);
}

function validateRestockInventoryItem(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('Invalid quantity-tracked stock receipt details.');
  }
  const quantity = nonnegativeInteger(input.quantity, 'Restock quantity', 0);
  if (quantity < 1) invalid('The restock quantity must be a whole number of at least 1.');
  const condition = input.condition || 'Good';
  if (typeof condition !== 'string' || !conditions.has(condition)) invalid('Choose a valid item condition.');
  return {
    quantity,
    unitCost: nonnegativeAmount(input.unitCost, 'Cost per unit'),
    dateAcquired: optionalDate(input.dateAcquired),
    timeAcquired: optionalTime(input.timeAcquired),
    condition,
    receiptReference: optionalText(input.receiptReference, 'Receipt reference', 120),
  };
}

function validateInventoryItem(input, includeReason) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('Invalid inventory item details.');
  }

  const condition = input.condition || 'New';
  if (typeof condition !== 'string' || !conditions.has(condition)) {
    invalid('Choose a valid item condition.');
  }

  const unit = input.unitOfMeasure === undefined || input.unitOfMeasure === null || input.unitOfMeasure === ''
    ? 'piece'
    : requiredText(input.unitOfMeasure, 'Unit of measure', 60);
  const unitCost = nonnegativeAmount(input.unitCost, 'Cost per unit');
  const quantity = nonnegativeInteger(input.quantity, 'Quantity', 1);
  const acquisitionCost = includeReason
    ? nonnegativeAmount(input.acquisitionCost, 'Acquisition cost')
    : nonnegativeAmount(quantity * unitCost, 'Acquisition cost');
  const currentValue = input.currentValue === undefined || input.currentValue === null || input.currentValue === ''
    ? null
    : nonnegativeAmount(input.currentValue, 'Current assessed value');

  const trackingMode = input.trackingMode === undefined && includeReason
    ? undefined
    : input.trackingMode === undefined ? 'individual' : input.trackingMode;
  if (trackingMode !== undefined && !['individual', 'quantity'].includes(trackingMode)) {
    invalid('Choose a valid inventory tracking mode.');
  }
  const issueBehavior = input.issueBehavior === undefined && includeReason
    ? undefined
    : input.issueBehavior === undefined ? 'returnable' : input.issueBehavior;
  if (issueBehavior !== undefined && !['consumable', 'returnable'].includes(issueBehavior)) {
    invalid('Choose whether the stock is consumable or returned when issued.');
  }
  if (trackingMode === 'individual' && issueBehavior === 'consumable') {
    invalid('An item tracked one by one must be returned and tracked per unit.');
  }
  const serialNumber = optionalText(input.serialNumber, 'Manufacturer serial number', 120);
  const receiptReference = optionalText(input.receiptReference, 'Receipt reference', 120);
  const storageLocation = includeReason
    ? undefined
    : optionalText(input.storageLocation, 'Storage location', 160);
  if (serialNumber && trackingMode !== 'individual') {
    invalid('A manufacturer serial number is only for items tracked one by one.');
  }
  if (serialNumber && quantity !== 1) {
    invalid('Only one manufacturer serial number can go on each individually tracked item record.');
  }

  if (!includeReason && currentValue !== null && currentValue > acquisitionCost) {
    invalid('Current assessed value cannot exceed the calculated acquisition cost.');
  }

  const item = {
    itemCode: requiredText(input.itemCode, 'Item Code', 100),
    category: requiredText(input.category || 'Others', 'Category', 120),
    itemName: requiredText(input.itemName, 'Item Name', 500),
    description: requiredText(input.description, 'Item Description', 500),
    serialNumber,
    receiptReference,
    ...(storageLocation === undefined ? {} : { storageLocation: storageLocation || 'GSO Storage' }),
    ...(trackingMode === undefined ? {} : { trackingMode }),
    ...(issueBehavior === undefined ? {} : { issueBehavior }),
    dateAcquired: optionalDate(input.dateAcquired),
    timeAcquired: optionalTime(input.timeAcquired),
    unitCost,
    acquisitionCost,
    currentValue,
    quantity,
    unitOfMeasure: unit,
    condition,
  };

  return includeReason
    ? { ...item, reason: requiredText(input.reason, 'Reason for the change', 1000) }
    : item;
}

function validateCreateCategory(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('Invalid category details.');
  }
  return { name: requiredText(input.name, 'Category name', 120) };
}

function validateCategoryChange(input, includeName) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('Invalid category details.');
  }
  return {
    ...(includeName ? { name: requiredText(input.name, 'Category name', 120) } : {}),
    reason: requiredText(input.reason, 'Reason for the change', 1000),
  };
}

function validateCreateCategoryItemName(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('Invalid item name details.');
  }
  return { name: requiredText(input.name, 'Item name', 500) };
}


module.exports = {
  validateCreateInventoryItem,
  validateCreateInventoryItems,
  validateRestockInventoryItem,
  validateUpdateInventoryItem,
  validateCreateCategory,
  validateCategoryChange,
  validateCreateCategoryItemName,
};
