const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const usersController = require('./users.controller');

const router = express.Router();
const requireAdmin = requireRole('IT_ADMIN');

router.use(authenticate, requireAdmin);
router.get('/positions', usersController.listAccountPositions);
router.get('/', usersController.listSystemUsers);
router.post('/', usersController.createSystemUser);

module.exports = router;
