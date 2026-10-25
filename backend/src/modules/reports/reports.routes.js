const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/role.middleware');
const controller = require('./reports.controller');

const router = express.Router();
router.use(authenticate, requirePermission('reports.view'));
router.get('/operational', controller.getOperationalReports);
module.exports = router;
