const signaturesService = require('./signatures.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const getMySignature = asyncHandler(async (req, res) => {
  const signature = await signaturesService.getMySignature(req.user);
  res.json({ success: true, data: { signature } });
});

const saveMySignature = asyncHandler(async (req, res) => {
  const signature = await signaturesService.saveMySignature(req.user, req.body?.imageBase64);
  res.json({ success: true, data: { signature } });
});

module.exports = { getMySignature, saveMySignature };
