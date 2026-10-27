const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const departmentsController = require('./departments.controller');

const router = express.Router();

router.use(authenticate);
router.get('/', requireRole('GSO_STAFF', 'BORROWER'), departmentsController.listDepartments);
router.post('/', requireRole('GSO_STAFF'), departmentsController.createDepartment);

module.exports = router;
