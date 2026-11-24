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
  const user = await usersService.createSystemUser(req.body, req.user);
  res.status(201).json({ success: true, data: { user } });
});

const setSystemUserActive = asyncHandler(async (req, res) => {
  const user = await usersService.setSystemUserActive(req.params.userId, req.body?.isActive, req.user);
  res.json({ success: true, data: { user } });
});

const getSystemUserDetails = asyncHandler(async (req, res) => {
  const details = await usersService.getSystemUserDetails(req.params.userId);
  res.json({ success: true, data: { details } });
});

const updateSystemUser = asyncHandler(async (req, res) => {
  const user = await usersService.updateSystemUser(req.params.userId, req.body, req.user);
  res.json({ success: true, data: { user } });
});

module.exports = { listSystemUsers, listAccountPositions, createSystemUser, setSystemUserActive, getSystemUserDetails, updateSystemUser };
