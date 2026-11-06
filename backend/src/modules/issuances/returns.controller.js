const returnsService = require('./returns.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const createEmployeeReturn = asyncHandler(async (req, res) => {
  const request = await returnsService.createEmployeeReturn(req.body, req.user);
  res.status(201).json({ success: true, data: { request } });
});

const resolveReturnRepair = asyncHandler(async (req, res) => {
  const result = await returnsService.resolveReturnRepair(req.params.returnId, req.body, req.user);
  res.json({ success: true, data: { result } });
});

const updateReturnSettlement = asyncHandler(async (req, res) => {
  const result = await returnsService.updateReturnSettlement(req.params.returnId, req.body, req.user);
  res.json({ success: true, data: { result } });
});

const requestReturnApproval = asyncHandler(async (req, res) => {
  const result = await returnsService.requestReturnApproval(req.params.returnId, req.body, req.user);
  res.status(201).json({ success: true, data: { result } });
});

const decideApprovalRequest = asyncHandler(async (req, res) => {
  const result = await returnsService.decideApprovalRequest(req.params.returnId, req.body, req.user);
  res.json({ success: true, data: { result } });
});

const listApprovalRequests = asyncHandler(async (req, res) => {
  const requests = await returnsService.listApprovalRequests(req.user);
  res.json({ success: true, data: { requests } });
});

const listHoldings = asyncHandler(async (req, res) => {
  const holdings = await returnsService.listHoldings(req.query);
  res.json({ success: true, data: holdings });
});

const listIssuanceRecords = asyncHandler(async (req, res) => {
  const records = await returnsService.listIssuanceRecords(req.query);
  res.json({ success: true, data: { records } });
});

const sendBulkReturnOtp = asyncHandler(async (req, res) => {
  const challenge = await returnsService.sendBulkReturnOtp(req.body, req.user);
  res.status(201).json({ success: true, data: { challenge } });
});

const sendTaggedReturnOtp = asyncHandler(async (req, res) => {
  const challenge = await returnsService.sendTaggedReturnOtp(req.params.tagCode, req.user);
  res.status(201).json({ success: true, data: { challenge } });
});

const confirmScannedTagReturn = asyncHandler(async (req, res) => {
  const result = await returnsService.confirmScannedTagReturn(req.params.tagCode, req.body, req.user);
  res.json({ success: true, data: { result } });
});

const completeTaggedAssetRepair = asyncHandler(async (req, res) => {
  const result = await returnsService.completeTaggedAssetRepair(req.params.tagCode, req.user);
  res.json({ success: true, data: { result } });
});

const lookupReturnApproval = asyncHandler(async (req, res) => {
  const request = await returnsService.lookupReturnApproval(req.query.token);
  res.json({ success: true, data: { request } });
});

const decideReturnApproval = asyncHandler(async (req, res) => {
  const request = await returnsService.decideReturnApproval(req.body);
  res.json({ success: true, data: { request } });
});

module.exports = {
  createEmployeeReturn,
  resolveReturnRepair,
  updateReturnSettlement,
  requestReturnApproval,
  decideApprovalRequest,
  listApprovalRequests,
  listHoldings,
  listIssuanceRecords,
  sendBulkReturnOtp,
  sendTaggedReturnOtp,
  confirmScannedTagReturn,
  completeTaggedAssetRepair,
  lookupReturnApproval,
  decideReturnApproval,
};
