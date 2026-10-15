const returnsService = require('./returns.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const createEmployeeReturn = asyncHandler(async (req, res) => {
  const request = await returnsService.createEmployeeReturn(req.body, req.user);
  res.status(201).json({ success: true, data: { request } });
});

const lookupReturnApproval = asyncHandler(async (req, res) => {
  const request = await returnsService.lookupReturnApproval(req.query.token);
  res.json({ success: true, data: { request } });
});

const decideReturnApproval = asyncHandler(async (req, res) => {
  const request = await returnsService.decideReturnApproval(req.body);
  res.json({ success: true, data: { request } });
});

module.exports = { createEmployeeReturn, lookupReturnApproval, decideReturnApproval };
