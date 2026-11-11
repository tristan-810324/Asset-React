const employeesService = require('./employees.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const listEmployees = asyncHandler(async (req, res) => {
  const employees = await employeesService.listEmployees();
  res.json({ success: true, data: { employees } });
});

const listEmployeePositions = asyncHandler(async (_req, res) => {
  const positions = await employeesService.listEmployeePositions();
  res.json({ success: true, data: { positions } });
});

const createEmployeePosition = asyncHandler(async (req, res) => {
  const position = await employeesService.createEmployeePosition(req.body, req.user);
  res.status(201).json({ success: true, data: { position } });
});

const renameEmployeePosition = asyncHandler(async (req, res) => {
  const result = await employeesService.renameEmployeePosition(req.params.positionId, req.body, req.user);
  res.json({ success: true, data: result });
});

const deleteEmployeePosition = asyncHandler(async (req, res) => {
  const result = await employeesService.deleteEmployeePosition(req.params.positionId, req.body, req.user);
  res.json({ success: true, data: result });
});

const createEmployee = asyncHandler(async (req, res) => {
  const employee = await employeesService.createEmployee(req.body, req.user);
  res.status(201).json({ success: true, data: { employee } });
});

const updateEmployee = asyncHandler(async (req, res) => {
  const employee = await employeesService.updateEmployee(req.params.employeeCode, req.body, req.user);
  res.json({ success: true, data: { employee } });
});

module.exports = {
  listEmployees,
  listEmployeePositions,
  createEmployeePosition,
  renameEmployeePosition,
  deleteEmployeePosition,
  createEmployee,
  updateEmployee,
};
