const dashboardRepository = require('./dashboard.repository');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const getSummary = asyncHandler(async (_req, res) => {
  const summary = await dashboardRepository.getSummary();
  res.json({ success: true, data: { summary } });
});

module.exports = { getSummary };
