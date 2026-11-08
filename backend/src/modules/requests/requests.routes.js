const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const requestsController = require('./requests.controller');

const router = express.Router();

router.use(authenticate);

router.get('/assets', requireRole('BORROWER'), requestsController.listAssets);
router.get('/requester-staff', requireRole('BORROWER'), requestsController.listRequesterDepartmentStaff);
router.get('/mine', requireRole('BORROWER'), requestsController.listMine);
router.post('/', requireRole('BORROWER'), requestsController.createRequest);
router.get('/mine/:id', requireRole('BORROWER'), requestsController.getMine);
router.post('/mine/:id/cancel', requireRole('BORROWER'), requestsController.cancelMine);
router.post('/mine/:id/respond', requireRole('BORROWER'), requestsController.respondMine);
router.post('/mine/:id/return', requireRole('BORROWER'), requestsController.requestReturn);

router.get('/purchase-requisitions', requireRole('GSO_HEAD'), requestsController.listPurchaseRequisitions);
router.patch('/purchase-requisitions/:id/review', requireRole('GSO_HEAD'), requestsController.reviewPurchaseRequisition);
router.post('/purchase-requisitions/:id/send-to-finance', requireRole('GSO_HEAD'), requestsController.sendPurchaseRequisitionToFinance);
router.post('/purchase-requisitions/:id/finance-response', requireRole('GSO_HEAD'), requestsController.recordFinanceResponse);

router.get('/', requireRole('GSO_STAFF'), requestsController.listAll);
router.get('/:id', requireRole('GSO_STAFF'), requestsController.getForGso);
router.patch('/:id/status', requireRole('GSO_STAFF'), requestsController.updateStatus);

module.exports = router;
