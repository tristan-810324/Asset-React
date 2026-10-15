const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const issuancesController = require('./issuances.controller');

const router = express.Router();

router.post('/', authenticate, requireRole('GSO_STAFF'), issuancesController.createIssuance);
router.get('/employee/:employeeCode', authenticate, requireRole('GSO_STAFF'), issuancesController.listEmployeeIssuances);
router.get('/approval', issuancesController.lookupApproval);
router.post('/approval', issuancesController.decideApproval);

module.exports = router;
