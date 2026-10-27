const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const controller = require('./requester-identity.controller');

const router = express.Router();

router.use(authenticate);
router.get('/me', requireRole('BORROWER'), controller.getMine);
router.put('/me', requireRole('BORROWER'), controller.submitMine);
router.get('/reviews', requireRole('GSO_STAFF'), controller.listReviews);
router.patch('/reviews/:userId', requireRole('GSO_STAFF'), controller.review);

module.exports = router;
