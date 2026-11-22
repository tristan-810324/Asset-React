const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const service = require('./charges.service');

// Charged items GSO Staff collect. Only GSO Staff can see receipts and mark a charge Paid.
const router = express.Router();
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(authenticate, requireRole('GSO_STAFF'));

router.get('/', asyncHandler(async (req, res) => {
  const charges = await service.listCharges();
  res.json({ success: true, data: { charges } });
}));

router.get('/:kind/:ref/receipt', asyncHandler(async (req, res) => {
  const receipt = await service.getReceipt(req.params.kind, req.params.ref);
  res.json({ success: true, data: { receipt } });
}));

router.post('/:kind/:ref/paid', asyncHandler(async (req, res) => {
  const result = await service.payCharge(req.params.kind, req.params.ref, req.body, req.user);
  res.json({ success: true, data: { result } });
}));

module.exports = router;
