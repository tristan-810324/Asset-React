const auditService = require('./audit.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const listLogs = asyncHandler(async (req, res) => {
  const result = await auditService.listLogs(req.query);
  res.json({ success: true, data: result });
});

module.exports = { listLogs };
