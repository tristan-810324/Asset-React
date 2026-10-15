const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const employeesController = require('./employees.controller');

const router = express.Router();

router.use(authenticate, requireRole('GSO_STAFF'));
router.get('/', employeesController.listEmployees);
router.post('/', employeesController.createEmployee);
router.put('/:employeeCode', employeesController.updateEmployee);

module.exports = router;
