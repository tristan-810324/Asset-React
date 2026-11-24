const repository = require('./movements.repository');

function requiredText(value, label, min = 1, max = 300) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw Object.assign(new Error(`${label} is required (${min}-${max} characters).`), { status: 400 });
  }
  return value.trim();
}

function validateMovement(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Invalid movement details.'), { status: 400 });
  const movementType = input.movementType;
  if (!['TRANSFER', 'TURNOVER', 'LOCATION_CHANGE'].includes(movementType)) throw Object.assign(new Error('Choose a valid movement type.'), { status: 400 });
  const itemId = String(input.itemId ?? '');
  if (!/^\d{1,20}$/.test(itemId)) throw Object.assign(new Error('Choose a valid item.'), { status: 400 });
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2147483647) throw Object.assign(new Error('The quantity must be a whole number greater than zero.'), { status: 400 });
  const fromEmployeeCode = typeof input.fromEmployeeCode === 'string' ? input.fromEmployeeCode.trim() : '';
  const toEmployeeCode = typeof input.toEmployeeCode === 'string' ? input.toEmployeeCode.trim() : '';
  const fromLocation = typeof input.fromLocation === 'string' ? input.fromLocation.trim() : '';
  const toLocation = typeof input.toLocation === 'string' ? input.toLocation.trim() : '';
  if (movementType === 'TRANSFER' && (!fromEmployeeCode || !toEmployeeCode)) throw Object.assign(new Error('A transfer needs a source and a recipient employee.'), { status: 400 });
  if (movementType === 'TURNOVER' && (!fromEmployeeCode || !toLocation)) throw Object.assign(new Error('A turnover needs a source employee and a receiving location.'), { status: 400 });
  if (movementType === 'LOCATION_CHANGE' && (!fromLocation || !toLocation)) throw Object.assign(new Error('You need the old and new stockroom location.'), { status: 400 });
  return {
    movementType, itemId, quantity, fromEmployeeCode, toEmployeeCode, fromLocation, toLocation,
    reason: requiredText(input.reason, 'Movement reason', 5, 1000),
    acknowledgement: requiredText(input.acknowledgement, 'Receiving acknowledgement', 2, 300),
  };
}

async function listMovements() { return repository.listMovements(); }
async function createMovement(input, user) { return repository.createMovement(validateMovement(input), user.id); }
module.exports = { listMovements, createMovement };
