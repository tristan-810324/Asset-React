const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const issuancesController = require('./issuances.controller');
const returnsController = require('./returns.controller');

const router = express.Router();

router.post('/', authenticate, requireRole('GSO_STAFF'), issuancesController.createIssuance);
router.post('/batch', authenticate, requireRole('GSO_STAFF'), issuancesController.createIssuanceBatch);
router.get('/employee/:employeeCode', authenticate, requireRole('GSO_STAFF'), issuancesController.listEmployeeIssuances);
router.post('/returns', authenticate, requireRole('GSO_STAFF'), returnsController.createEmployeeReturn);
router.get('/returns/approval', returnsController.lookupReturnApproval);
router.post('/returns/approval', returnsController.decideReturnApproval);
router.get('/approval', issuancesController.lookupApproval);
router.post('/approval', issuancesController.decideApproval);

module.exports = router;
