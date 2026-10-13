const usersService = require('./users.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const listGsoAccounts = asyncHandler(async (req, res) => {
  const users = await usersService.listGsoAccounts();
  res.json({ success: true, data: { users } });
});

const createGsoAccount = asyncHandler(async (req, res) => {
  const user = await usersService.createGsoAccount(req.body);
  res.status(201).json({ success: true, data: { user } });
});

module.exports = { listGsoAccounts, createGsoAccount };
