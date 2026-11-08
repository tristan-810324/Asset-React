const requestsService = require('./requests.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const listAssets = asyncHandler(async (_req, res) => {
  const items = await requestsService.listAssets();
  res.json({ success: true, data: { items } });
});

const listRequesterDepartmentStaff = asyncHandler(async (req, res) => {
  const staff = await requestsService.listRequesterDepartmentStaff(req.user);
  res.json({ success: true, data: { staff } });
});

const createRequest = asyncHandler(async (req, res) => {
  const request = await requestsService.createRequest(req.body, req.user);
  res.status(201).json({ success: true, data: { request } });
});

const listMine = asyncHandler(async (req, res) => {
  const requests = await requestsService.listMine(req.user);
  res.json({ success: true, data: { requests } });
});

const getMine = asyncHandler(async (req, res) => {
  const request = await requestsService.getMine(req.params.id, req.user);
  res.json({ success: true, data: { request } });
});

const cancelMine = asyncHandler(async (req, res) => {
  const request = await requestsService.cancelMine(req.params.id, req.user);
  res.json({ success: true, data: { request } });
});

const respondMine = asyncHandler(async (req, res) => {
  const request = await requestsService.respondMine(req.params.id, req.body, req.user);
  res.json({ success: true, data: { request } });
});

const requestReturn = asyncHandler(async (req, res) => {
  const request = await requestsService.requestReturn(req.params.id, req.user);
  res.json({ success: true, data: { request } });
});

const listAll = asyncHandler(async (req, res) => {
  const requests = await requestsService.listAll(req.query);
  res.json({ success: true, data: { requests } });
});

const listPurchaseRequisitions = asyncHandler(async (req, res) => {
  const requests = await requestsService.listPurchaseRequisitions(req.query);
  res.json({ success: true, data: { requests } });
});

const reviewPurchaseRequisition = asyncHandler(async (req, res) => {
  const result = await requestsService.reviewPurchaseRequisition(req.params.id, req.body, req.user);
  res.json({ success: true, data: result });
});

const sendPurchaseRequisitionToFinance = asyncHandler(async (req, res) => {
  const result = await requestsService.sendPurchaseRequisitionToFinance(req.params.id, req.body, req.user);
  res.json({ success: true, data: result });
});

const recordFinanceResponse = asyncHandler(async (req, res) => {
  const result = await requestsService.recordFinanceResponse(req.params.id, req.body, req.user);
  res.json({ success: true, data: result });
});

const getForGso = asyncHandler(async (req, res) => {
  const request = await requestsService.getForGso(req.params.id);
  res.json({ success: true, data: { request } });
});

const updateStatus = asyncHandler(async (req, res) => {
  const request = await requestsService.updateStatus(req.params.id, req.body, req.user);
  res.json({ success: true, data: { request } });
});

module.exports = {
  listAssets,
  listRequesterDepartmentStaff,
  createRequest,
  listMine,
  getMine,
  cancelMine,
  respondMine,
  requestReturn,
  listAll,
  listPurchaseRequisitions,
  reviewPurchaseRequisition,
  sendPurchaseRequisitionToFinance,
  recordFinanceResponse,
  getForGso,
  updateStatus,
};
