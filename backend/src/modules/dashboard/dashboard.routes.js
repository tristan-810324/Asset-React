const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/role.middleware');
const dashboardController = require('./dashboard.controller');

const router = express.Router();
router.use(authenticate, requirePermission('reports.view'));
router.get('/summary', dashboardController.getSummary);
module.exports = router;
