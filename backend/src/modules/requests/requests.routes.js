const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const requestsController = require('./requests.controller');

const router = express.Router();

router.use(authenticate);

router.get('/assets', requireRole('BORROWER'), requestsController.listAssets);
router.get('/purchase-item-names', requireRole('BORROWER'), requestsController.listPurchaseItemNames);
router.get('/requester-staff', requireRole('BORROWER'), requestsController.listRequesterDepartmentStaff);
router.get('/mine', requireRole('BORROWER'), requestsController.listMine);
router.get('/mine/activity', requireRole('BORROWER'), requestsController.listMyActivity);
router.post('/', requireRole('BORROWER'), requestsController.createRequest);
router.get('/mine/:id', requireRole('BORROWER'), requestsController.getMine);
router.post('/mine/:id/cancel', requireRole('BORROWER'), requestsController.cancelMine);
router.post('/mine/:id/respond', requireRole('BORROWER'), requestsController.respondMine);
router.post('/mine/:id/return', requireRole('BORROWER'), requestsController.requestReturn);

router.get('/purchase-requisitions', requireRole('GSO_HEAD'), requestsController.listPurchaseRequisitions);
router.patch('/purchase-requisitions/:id/review', requireRole('GSO_HEAD'), requestsController.reviewPurchaseRequisition);
router.post('/purchase-requisitions/:id/send-to-finance', requireRole('GSO_HEAD'), requestsController.sendPurchaseRequisitionToFinance);
router.get('/purchase-requisitions/issuance-queue', requireRole('GSO_STAFF'), requestsController.listStaffPurchaseRequisitions);
router.patch('/purchase-requisitions/:id/staff-review', requireRole('GSO_STAFF'), requestsController.staffReviewPurchaseRequisition);
router.get('/purchase-requisitions/awaiting-delivery', requireRole('GSO_STAFF'), requestsController.listAwaitingPurchaseDeliveries);
router.post('/purchase-requisitions/deliveries', requireRole('GSO_STAFF'), requestsController.recordPurchaseDeliveries);
router.post('/purchase-requisitions/:id/deliveries/:receiptId/undo', requireRole('GSO_STAFF'), requestsController.undoPurchaseDelivery);
router.get('/purchase-requisitions/:id/issuance-details', requireRole('GSO_STAFF'), requestsController.getStaffPurchaseRequisitionForIssuance);

router.get('/', requireRole('GSO_STAFF'), requestsController.listAll);
router.get('/:id', requireRole('GSO_STAFF'), requestsController.getForGso);
router.patch('/:id/status', requireRole('GSO_STAFF'), requestsController.updateStatus);

module.exports = router;
