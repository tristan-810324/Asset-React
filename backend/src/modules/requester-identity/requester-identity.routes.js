const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const controller = require('./requester-identity.controller');

const router = express.Router();

router.use(authenticate);
router.get('/me', requireRole('BORROWER', 'GSO_HEAD'), controller.getMine);
router.put('/me', requireRole('BORROWER', 'GSO_HEAD'), controller.submitMine);
// IT Admin can read the requester profiles (History and Requester Verification).
router.get('/reviews', requireRole('GSO_STAFF', 'IT_ADMIN'), controller.listReviews);
router.get('/reviews/:userId/picture', requireRole('GSO_STAFF', 'IT_ADMIN'), controller.getReviewPicture);
// IT Admin can decide verifications from User management; GSO Staff keep the same access.
router.patch('/reviews/:userId', requireRole('GSO_STAFF', 'IT_ADMIN'), controller.review);

module.exports = router;
