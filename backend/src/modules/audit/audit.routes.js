const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const auditController = require('./audit.controller');

const router = express.Router();

// GSO officers can review these operational records but cannot change them.
router.use(authenticate, requireRole('IT_ADMIN', 'GSO_STAFF', 'GSO_HEAD'));
router.get('/logs', auditController.listLogs);

module.exports = router;
