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

const listMyPendingIssuanceBatches = asyncHandler(async (req, res) => {
  const batches = await issuancesService.listMyPendingIssuanceBatches(req.user);
  res.json({ success: true, data: { batches } });
});

const getIssuanceBatch = asyncHandler(async (req, res) => {
  const batch = await issuancesService.getIssuanceBatch(req.params.batchId);
  res.json({ success: true, data: { batch } });
});

const listApprovedIssuanceBatches = asyncHandler(async (req, res) => {
  const batches = await issuancesService.listApprovedIssuanceBatches();
  res.json({ success: true, data: { batches } });
});

const getAssetTag = asyncHandler(async (req, res) => {
  const tag = await issuancesService.getAssetTag(req.params.tagCode);
  res.json({ success: true, data: { tag } });
});

const inspectAssetTag = asyncHandler(async (req, res) => {
  const tag = await issuancesService.inspectAssetTag(req.params.tagCode, req.body, req.user);
  res.json({ success: true, data: { tag } });
});

const decideMyIssuanceBatch = asyncHandler(async (req, res) => {
  const decision = await issuancesService.decideMyIssuanceBatch(req.params.batchId, req.body, req.user);
  res.json({ success: true, data: { decision } });
});

const lookupApproval = asyncHandler(async (req, res) => {
  const issuance = await issuancesService.lookupApproval(req.query.token);
  res.json({ success: true, data: { issuance } });
});

const decideApproval = asyncHandler(async (req, res) => {
  const issuance = await issuancesService.decideApproval(req.body);
  res.json({ success: true, data: { issuance } });
});

module.exports = {
  createIssuance,
  createIssuanceBatch,
  listEmployeeIssuances,
  listMyPendingIssuanceBatches,
  getIssuanceBatch,
  listApprovedIssuanceBatches,
  getAssetTag,
  inspectAssetTag,
  decideMyIssuanceBatch,
  lookupApproval,
  decideApproval,
};
