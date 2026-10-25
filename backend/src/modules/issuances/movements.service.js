const repository = require('./movements.repository');

function requiredText(value, label, min = 1, max = 300) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw Object.assign(new Error(`${label} ay kailangan (${min}-${max} characters).`), { status: 400 });
  }
  return value.trim();
}

function validateMovement(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Hindi valid ang movement details.'), { status: 400 });
  const movementType = input.movementType;
  if (!['TRANSFER', 'TURNOVER', 'LOCATION_CHANGE'].includes(movementType)) throw Object.assign(new Error('Pumili ng valid na movement type.'), { status: 400 });
  const itemId = String(input.itemId ?? '');
  if (!/^\d{1,20}$/.test(itemId)) throw Object.assign(new Error('Pumili ng valid na item.'), { status: 400 });
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2147483647) throw Object.assign(new Error('Ang quantity ay dapat whole number na higit sa zero.'), { status: 400 });
  const fromEmployeeCode = typeof input.fromEmployeeCode === 'string' ? input.fromEmployeeCode.trim() : '';
  const toEmployeeCode = typeof input.toEmployeeCode === 'string' ? input.toEmployeeCode.trim() : '';
  const fromLocation = typeof input.fromLocation === 'string' ? input.fromLocation.trim() : '';
  const toLocation = typeof input.toLocation === 'string' ? input.toLocation.trim() : '';
  if (movementType === 'TRANSFER' && (!fromEmployeeCode || !toEmployeeCode)) throw Object.assign(new Error('Kailangan ang source at recipient employee para sa transfer.'), { status: 400 });
  if (movementType === 'TURNOVER' && (!fromEmployeeCode || !toLocation)) throw Object.assign(new Error('Kailangan ang source employee at receiving location para sa turnover.'), { status: 400 });
  if (movementType === 'LOCATION_CHANGE' && (!fromLocation || !toLocation)) throw Object.assign(new Error('Kailangan ang dating at bagong stockroom location.'), { status: 400 });
  return {
    movementType, itemId, quantity, fromEmployeeCode, toEmployeeCode, fromLocation, toLocation,
    reason: requiredText(input.reason, 'Movement reason', 5, 1000),
    acknowledgement: requiredText(input.acknowledgement, 'Receiving acknowledgement', 2, 300),
  };
}

async function listMovements() { return repository.listMovements(); }
async function createMovement(input, user) { return repository.createMovement(validateMovement(input), user.id); }
module.exports = { listMovements, createMovement };
