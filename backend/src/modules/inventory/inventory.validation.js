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
    invalid(`${label} ay kailangan.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    invalid(`${label} ay hindi dapat lumampas sa ${maxLength} characters.`);
  }
  return normalized;
}

function optionalDate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalid('Hindi valid ang date of acquisition.');
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    invalid('Hindi valid ang date of acquisition.');
  }
  return value;
}

function optionalTime(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    invalid('Hindi valid ang time of acquisition.');
  }
  return value;
}

function nonnegativeAmount(value, label, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 9999999999.99) {
    invalid(`${label} ay dapat valid at hindi negatibo.`);
  }
  return Math.round(amount * 100) / 100;
}

function nonnegativeInteger(value, label, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 2147483647) {
    invalid(`${label} ay dapat whole number na hindi negatibo.`);
  }
  return quantity;
}

function validateCreateInventoryItem(input) {
  return validateInventoryItem(input, false);
}

function validateUpdateInventoryItem(input) {
  return validateInventoryItem(input, true);
}

function validateInventoryItem(input, includeReason) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('Hindi valid ang inventory item details.');
  }

  const condition = input.condition || 'New';
  if (typeof condition !== 'string' || !conditions.has(condition)) {
    invalid('Pumili ng valid na item condition.');
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

  if (!includeReason && currentValue !== null && currentValue > acquisitionCost) {
    invalid('Current assessed value cannot exceed the calculated acquisition cost.');
  }

  const item = {
    itemCode: requiredText(input.itemCode, 'Item Code', 100),
    category: requiredText(input.category || 'Others', 'Category', 120),
    description: requiredText(input.description, 'Item Description', 500),
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
    ? { ...item, reason: requiredText(input.reason, 'Dahilan ng pagbabago', 1000) }
    : item;
}

function validateCreateCategory(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('Hindi valid ang category details.');
  }
  return { name: requiredText(input.name, 'Category name', 120) };
}

function validateCategoryChange(input, includeName) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('Hindi valid ang category details.');
  }
  return {
    ...(includeName ? { name: requiredText(input.name, 'Category name', 120) } : {}),
    reason: requiredText(input.reason, 'Dahilan ng pagbabago', 1000),
  };
}

module.exports = {
  validateCreateInventoryItem,
  validateUpdateInventoryItem,
  validateCreateCategory,
  validateCategoryChange,
};
