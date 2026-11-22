const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const requestsController = require('./requests.controller');
const serviceWorkOrdersController = require('./service-work-orders.controller');

const router = express.Router();

router.use(authenticate);

// GSO Staff work GSO jobs and IT Staff work ITSS jobs. The service checks the team of each job.
const SERVICE_TEAM_ROLES = ['GSO_STAFF', 'IT_STAFF', 'IT_ADMIN'];

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
router.post('/mine/:id/confirm-service', requireRole('BORROWER'), requestsController.confirmMyService);
router.post('/mine/:id/reopen-service', requireRole('BORROWER'), requestsController.reopenMyService);

router.get('/service-work-orders', requireRole(...SERVICE_TEAM_ROLES), serviceWorkOrdersController.listWorkOrders);
router.get('/service-work-orders/:id', requireRole(...SERVICE_TEAM_ROLES), serviceWorkOrdersController.getWorkOrder);
router.post('/service-work-orders/:id/:action', requireRole(...SERVICE_TEAM_ROLES), serviceWorkOrdersController.actOnWorkOrder);

router.get('/purchase-requisitions', requireRole('GSO_HEAD'), requestsController.listPurchaseRequisitions);
router.patch('/purchase-requisitions/:id/review', requireRole('GSO_HEAD'), requestsController.reviewPurchaseRequisition);
router.post('/purchase-requisitions/:id/hand-to-finance', requireRole('GSO_STAFF'), requestsController.handPurchaseRequisitionToFinance);
router.post('/purchase-requisitions/:id/finance-pdf-reprint', requireRole('GSO_STAFF'), requestsController.logFinancePdfReprint);
router.get('/purchase-requisitions/:id/finance-pdf', requireRole('GSO_STAFF'), requestsController.getFinancePdf);
router.get('/purchase-requisitions/items-to-buy', requireRole('GSO_STAFF'), requestsController.listItemsToBuy);
router.get('/purchase-requisitions/issuance-queue', requireRole('GSO_STAFF'), requestsController.listStaffPurchaseRequisitions);
router.patch('/purchase-requisitions/:id/staff-review', requireRole('GSO_STAFF'), requestsController.staffReviewPurchaseRequisition);
router.get('/purchase-requisitions/awaiting-delivery', requireRole('GSO_STAFF'), requestsController.listAwaitingPurchaseDeliveries);
router.post('/purchase-requisitions/deliveries', requireRole('GSO_STAFF'), requestsController.recordPurchaseDeliveries);
router.post('/purchase-requisitions/swap-unit', requireRole('GSO_STAFF'), requestsController.swapRequisitionUnit);
router.post('/purchase-requisitions/:id/deliveries/:receiptId/undo', requireRole('GSO_STAFF'), requestsController.undoPurchaseDelivery);
router.get('/purchase-requisitions/:id/issuance-details', requireRole('GSO_STAFF'), requestsController.getStaffPurchaseRequisitionForIssuance);

router.post('/facility-slips/print', requireRole('GSO_STAFF'), requestsController.recordFacilitySlipPrints);
router.post('/:id/slip/reprint', requireRole('GSO_STAFF'), requestsController.reprintFacilitySlip);
router.patch('/:id/assets/:assetId/settlement', requireRole('GSO_STAFF'), requestsController.settleFacilityItem);
router.get('/facility-finance-report', requireRole('GSO_STAFF', 'IT_ADMIN'), requestsController.getFacilityFinanceReport);
router.patch('/facility-repairs/:assetId', requireRole('GSO_STAFF', 'IT_ADMIN'), requestsController.resolveFacilityRepair);
router.patch('/:id/damage-settlement', requireRole('GSO_STAFF'), requestsController.saveFacilityDamageDecision);

router.get('/', requireRole('GSO_STAFF'), requestsController.listAll);
router.get('/:id', requireRole('GSO_STAFF'), requestsController.getForGso);
router.patch('/:id/status', requireRole('GSO_STAFF'), requestsController.updateStatus);

module.exports = router;
