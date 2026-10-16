const issuancesService = require('./issuances.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const createIssuance = asyncHandler(async (req, res) => {
  const issuance = await issuancesService.createIssuance(req.body, req.user);
  res.status(201).json({ success: true, data: { issuance } });
});

const createIssuanceBatch = asyncHandler(async (req, res) => {
  const batch = await issuancesService.createIssuanceBatch(req.body, req.user);
  res.status(201).json({ success: true, data: { batch } });
});

const listEmployeeIssuances = asyncHandler(async (req, res) => {
  const result = await issuancesService.listEmployeeIssuances(req.params.employeeCode);
  res.json({ success: true, data: result });
});

const lookupApproval = asyncHandler(async (req, res) => {
  const issuance = await issuancesService.lookupApproval(req.query.token);
  res.json({ success: true, data: { issuance } });
});

const decideApproval = asyncHandler(async (req, res) => {
  const issuance = await issuancesService.decideApproval(req.body);
  res.json({ success: true, data: { issuance } });
});

module.exports = { createIssuance, createIssuanceBatch, listEmployeeIssuances, lookupApproval, decideApproval };
