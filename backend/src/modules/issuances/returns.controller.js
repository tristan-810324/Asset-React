const returnsService = require('./returns.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const createEmployeeReturn = asyncHandler(async (req, res) => {
  const request = await returnsService.createEmployeeReturn(req.body, req.user);
  res.status(201).json({ success: true, data: { request } });
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
  confirmScannedTagReturn,
  completeTaggedAssetRepair,
  lookupReturnApproval,
  decideReturnApproval,
};
