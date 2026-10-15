const departmentsService = require('./departments.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const listDepartments = asyncHandler(async (req, res) => {
  const departments = await departmentsService.listDepartments();
  res.json({ success: true, data: { departments } });
});

const createDepartment = asyncHandler(async (req, res) => {
  const department = await departmentsService.createDepartment(req.body, req.user);
  res.status(201).json({ success: true, data: { department } });
});

module.exports = { listDepartments, createDepartment };
