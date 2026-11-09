const requestsService = require('./requests.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const listAssets = asyncHandler(async (_req, res) => {
  const items = await requestsService.listAssets();
  res.json({ success: true, data: { items } });
});

const listPurchaseItemNames = asyncHandler(async (_req, res) => {
  const itemNames = await requestsService.listPurchaseItemNames();
  res.json({ success: true, data: { itemNames } });
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

const listStaffPurchaseRequisitions = asyncHandler(async (_req, res) => {
  const requests = await requestsService.listStaffPurchaseRequisitions();
  res.json({ success: true, data: { requests } });
});

const staffReviewPurchaseRequisition = asyncHandler(async (req, res) => {
  const result = await requestsService.staffReviewPurchaseRequisition(req.params.id, req.body, req.user);
  res.json({ success: true, data: result });
});

const getStaffPurchaseRequisitionForIssuance = asyncHandler(async (req, res) => {
  const request = await requestsService.getStaffPurchaseRequisitionForIssuance(req.params.id);
  res.json({ success: true, data: { request } });
});

const listAwaitingPurchaseDeliveries = asyncHandler(async (req, res) => {
  const lines = await requestsService.listAwaitingPurchaseDeliveries(req.query);
  res.json({ success: true, data: { lines } });
});

const recordPurchaseDeliveries = asyncHandler(async (req, res) => {
  const requests = await requestsService.recordPurchaseDeliveries(req.body, req.user);
  res.json({ success: true, data: { requests } });
});

const undoPurchaseDelivery = asyncHandler(async (req, res) => {
  const request = await requestsService.undoPurchaseDelivery(req.params.id, req.params.receiptId, req.user);
  res.json({ success: true, data: { request } });
});

const reviewPurchaseRequisition = asyncHandler(async (req, res) => {
  const result = await requestsService.reviewPurchaseRequisition(req.params.id, req.body, req.user);
  res.json({ success: true, data: result });
});

const sendPurchaseRequisitionToFinance = asyncHandler(async (req, res) => {
  const result = await requestsService.sendPurchaseRequisitionToFinance(req.params.id, req.body, req.user);
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
  listPurchaseItemNames,
  listRequesterDepartmentStaff,
  createRequest,
  listMine,
  getMine,
  cancelMine,
  respondMine,
  requestReturn,
  listAll,
  listPurchaseRequisitions,
  listStaffPurchaseRequisitions,
  staffReviewPurchaseRequisition,
  getStaffPurchaseRequisitionForIssuance,
  listAwaitingPurchaseDeliveries,
  recordPurchaseDeliveries,
  undoPurchaseDelivery,
  reviewPurchaseRequisition,
  sendPurchaseRequisitionToFinance,
  getForGso,
  updateStatus,
};
