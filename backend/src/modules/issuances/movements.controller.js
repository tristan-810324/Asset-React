const service = require('./movements.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const listMovements = asyncHandler(async (_req, res) => {
  const movements = await service.listMovements();
  res.json({ success: true, data: { movements } });
});

const createMovement = asyncHandler(async (req, res) => {
  const id = await service.createMovement(req.body, req.user);
  res.status(201).json({ success: true, data: { id } });
});

module.exports = { listMovements, createMovement };
