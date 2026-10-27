const service = require('./requester-identity.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const getMine = asyncHandler(async (req, res) => {
  const identity = await service.getMine(req.user);
  res.json({ success: true, data: { identity } });
});

const submitMine = asyncHandler(async (req, res) => {
  const identity = await service.submitMine(req.body, req.user);
  res.status(201).json({ success: true, data: { identity } });
});

const listReviews = asyncHandler(async (req, res) => {
  const profiles = await service.listReviews(req.query.status);
  res.json({ success: true, data: { profiles } });
});

const review = asyncHandler(async (req, res) => {
  const identity = await service.review(req.params.userId, req.body, req.user);
  res.json({ success: true, data: { identity } });
});

module.exports = { getMine, submitMine, listReviews, review };
