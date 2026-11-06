const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const countsService = require('./counts.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const router = express.Router();

router.use(authenticate, requireRole('GSO_STAFF', 'IT_ADMIN'));
router.get('/', asyncHandler(async (req, res) => {
  res.json({ success: true, data: { counts: await countsService.listCounts() } });
}));
router.post('/', asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: { count: await countsService.submitCount(req.body, req.user) } });
}));

module.exports = router;
