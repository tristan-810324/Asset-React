const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const issuancesController = require('./issuances.controller');
const returnsController = require('./returns.controller');

const router = express.Router();

router.post('/', authenticate, requireRole('GSO_STAFF'), issuancesController.createIssuance);
router.post('/batch', authenticate, requireRole('GSO_STAFF'), issuancesController.createIssuanceBatch);
router.get('/batch/approved', authenticate, requireRole('GSO_STAFF'), issuancesController.listApprovedIssuanceBatches);
router.get('/batch/:batchId', authenticate, requireRole('GSO_STAFF'), issuancesController.getIssuanceBatch);
router.get('/tags/:tagCode', authenticate, requireRole('GSO_STAFF'), issuancesController.getAssetTag);
router.patch('/tags/:tagCode/inspection', authenticate, requireRole('GSO_STAFF'), issuancesController.inspectAssetTag);
router.post('/tags/:tagCode/return', authenticate, requireRole('GSO_STAFF'), returnsController.confirmScannedTagReturn);
router.patch('/tags/:tagCode/repair-complete', authenticate, requireRole('GSO_STAFF'), returnsController.completeTaggedAssetRepair);
router.get('/mine/activity', authenticate, requireRole('BORROWER'), issuancesController.listMyIssuanceActivity);
router.get('/mine/pending', authenticate, requireRole('BORROWER'), issuancesController.listMyPendingIssuanceBatches);
router.post('/mine/:batchId/decision', authenticate, requireRole('BORROWER'), issuancesController.decideMyIssuanceBatch);
router.post('/batch/:batchId/handover', authenticate, requireRole('GSO_STAFF'), issuancesController.recordIssuanceHandover);
router.get('/employee/:employeeCode', authenticate, requireRole('GSO_STAFF'), issuancesController.listEmployeeIssuances);
router.post('/returns', authenticate, requireRole('GSO_STAFF'), returnsController.createEmployeeReturn);
router.get('/returns/approval', returnsController.lookupReturnApproval);
router.post('/returns/approval', returnsController.decideReturnApproval);
router.get('/approval', issuancesController.lookupApproval);
router.post('/approval', issuancesController.decideApproval);

module.exports = router;
