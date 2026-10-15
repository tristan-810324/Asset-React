const employeesService = require('./employees.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const listEmployees = asyncHandler(async (req, res) => {
  const employees = await employeesService.listEmployees();
  res.json({ success: true, data: { employees } });
});

const createEmployee = asyncHandler(async (req, res) => {
  const employee = await employeesService.createEmployee(req.body, req.user);
  res.status(201).json({ success: true, data: { employee } });
});

const updateEmployee = asyncHandler(async (req, res) => {
  const employee = await employeesService.updateEmployee(req.params.employeeCode, req.body, req.user);
  res.json({ success: true, data: { employee } });
});

module.exports = { listEmployees, createEmployee, updateEmployee };
