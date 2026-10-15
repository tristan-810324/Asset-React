const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const departmentsController = require('./departments.controller');

const router = express.Router();

router.use(authenticate, requireRole('GSO_STAFF'));
router.get('/', departmentsController.listDepartments);
router.post('/', departmentsController.createDepartment);

module.exports = router;
