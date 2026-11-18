const service = require('./loss-damage.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const listCases = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await service.listCases() });
});

const getCase = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getCase(req.params.id) });
});

const startReview = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.startReview(req.params.id, req.user) });
});

const decide = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.decide(req.params.id, req.body, req.user) });
});

const closeCase = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.closeCase(req.params.id, req.body, req.user) });
});

const getMine = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getMine(req.params.id, req.user) });
});

module.exports = {
  listCases,
  getCase,
  startReview,
  decide,
  closeCase,
  getMine,
};
