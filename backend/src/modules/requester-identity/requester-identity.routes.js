const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const controller = require('./requester-identity.controller');

const router = express.Router();

router.use(authenticate);
// GSO Staff can enter their own details too; IT Admin verifies them (see the review rule in the service).
router.get('/me', requireRole('BORROWER', 'GSO_HEAD', 'GSO_STAFF'), controller.getMine);
router.put('/me', requireRole('BORROWER', 'GSO_HEAD', 'GSO_STAFF'), controller.submitMine);
// IT Admin can read the requester profiles (History and Requester Verification).
router.get('/reviews', requireRole('GSO_STAFF', 'IT_ADMIN'), controller.listReviews);
router.get('/reviews/:userId/picture', requireRole('GSO_STAFF', 'IT_ADMIN'), controller.getReviewPicture);
// Only IT Admin decides verifications (User management). GSO Staff can still read the review list.
router.patch('/reviews/:userId', requireRole('IT_ADMIN'), controller.review);

module.exports = router;
