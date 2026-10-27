const usersService = require('./users.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const listSystemUsers = asyncHandler(async (req, res) => {
  const users = await usersService.listSystemUsers();
  res.json({ success: true, data: { users } });
});

const listAccountPositions = asyncHandler(async (req, res) => {
  const positions = await usersService.listAccountPositions();
  res.json({ success: true, data: { positions } });
});

const createSystemUser = asyncHandler(async (req, res) => {
  const user = await usersService.createSystemUser(req.body);
  res.status(201).json({ success: true, data: { user } });
});

module.exports = { listSystemUsers, listAccountPositions, createSystemUser };
