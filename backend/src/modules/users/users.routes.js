const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const usersController = require('./users.controller');

const router = express.Router();
const requireUserManagementAccess = requireRole('IT_ADMIN', 'IT_STAFF');

router.use(authenticate, requireUserManagementAccess);
router.get('/positions', usersController.listAccountPositions);
router.get('/', usersController.listSystemUsers);
router.post('/', usersController.createSystemUser);
router.patch('/:userId/active', requireRole('IT_ADMIN'), usersController.setSystemUserActive);
router.get('/:userId', requireRole('IT_ADMIN'), usersController.getSystemUserDetails);
router.patch('/:userId', requireRole('IT_ADMIN'), usersController.updateSystemUser);

module.exports = router;
