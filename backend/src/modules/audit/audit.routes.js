const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const auditController = require('./audit.controller');

const router = express.Router();

router.use(authenticate, requireRole('IT_ADMIN'));
router.get('/logs', auditController.listLogs);

module.exports = router;
