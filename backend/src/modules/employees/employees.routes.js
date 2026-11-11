const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const employeesController = require('./employees.controller');

const router = express.Router();

router.use(authenticate);
router.get('/positions', requireRole('GSO_STAFF', 'BORROWER'), employeesController.listEmployeePositions);
router.use(requireRole('GSO_STAFF'));
router.get('/', employeesController.listEmployees);
router.post('/positions', employeesController.createEmployeePosition);
router.put('/positions/:positionId', employeesController.renameEmployeePosition);
router.delete('/positions/:positionId', employeesController.deleteEmployeePosition);
router.post('/', employeesController.createEmployee);
router.put('/:employeeCode', employeesController.updateEmployee);

module.exports = router;
