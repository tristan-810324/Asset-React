const labelsService = require('./labels.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const listUnitLabels = asyncHandler(async (req, res) => {
  const labels = await labelsService.listUnitLabels();
  res.json({ success: true, data: { labels } });
});

const recordLabelPrint = asyncHandler(async (req, res) => {
  const label = await labelsService.recordLabelPrint(req.params.tagCode, req.user);
  res.json({ success: true, data: { label } });
});

const recordLabelPrintBatch = asyncHandler(async (req, res) => {
  const labels = await labelsService.recordLabelPrintBatch(req.body, req.user);
  res.json({ success: true, data: { labels } });
});

const reprintUnitLabel = asyncHandler(async (req, res) => {
  const label = await labelsService.reprintUnitLabel(req.params.tagCode, req.body, req.user);
  res.status(201).json({ success: true, data: { label } });
});

module.exports = { listUnitLabels, recordLabelPrint, recordLabelPrintBatch, reprintUnitLabel };
