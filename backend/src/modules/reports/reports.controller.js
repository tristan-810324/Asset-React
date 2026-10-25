const repository = require('./reports.repository');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const getOperationalReports = asyncHandler(async (_req, res) => {
  const reports = await repository.getOperationalReports();
  res.json({ success: true, data: { reports } });
});

module.exports = { getOperationalReports };
