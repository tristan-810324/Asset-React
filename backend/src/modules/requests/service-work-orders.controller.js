const serviceWorkOrdersService = require('./service-work-orders.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

// Each action name in the URL maps to one workflow step. The service checks the team, the assignment and the status.
const ACTIONS = Object.freeze({
  claim: (id, body, user) => serviceWorkOrdersService.claimWorkOrder(id, user),
  review: (id, body, user) => serviceWorkOrdersService.reviewWorkOrder(id, body, user),
  'need-info': (id, body, user) => serviceWorkOrdersService.requestMoreInformation(id, body, user),
  forward: (id, body, user) => serviceWorkOrdersService.forwardWorkOrder(id, body, user),
  start: (id, body, user) => serviceWorkOrdersService.startWork(id, body, user),
  progress: (id, body, user) => serviceWorkOrdersService.progressWork(id, body, user),
  complete: (id, body, user) => serviceWorkOrdersService.completeWork(id, body, user),
  'not-finished': (id, body, user) => serviceWorkOrdersService.notFinishWork(id, body, user),
  takeover: (id, body, user) => serviceWorkOrdersService.takeOverWorkOrder(id, body, user),
  reject: (id, body, user) => serviceWorkOrdersService.rejectWorkOrder(id, body, user),
});

const listWorkOrders = asyncHandler(async (req, res) => {
  const result = await serviceWorkOrdersService.listWorkOrders(req.query, req.user);
  res.json({ success: true, data: result });
});

const getWorkOrder = asyncHandler(async (req, res) => {
  const workOrder = await serviceWorkOrdersService.getWorkOrder(req.params.id, req.user);
  res.json({ success: true, data: { workOrder } });
});

const actOnWorkOrder = asyncHandler(async (req, res) => {
  if (!Object.hasOwn(ACTIONS, req.params.action)) {
    throw Object.assign(new Error('This service action does not exist.'), { status: 404 });
  }
  const workOrder = await ACTIONS[req.params.action](req.params.id, req.body, req.user);
  res.json({ success: true, data: { workOrder } });
});

// The requester adds details after submitting, such as the exact room or a photo of the problem.
const addRequesterInfo = asyncHandler(async (req, res) => {
  const workOrder = await serviceWorkOrdersService.addRequesterInfo(req.params.id, req.body, req.user);
  res.json({ success: true, data: { workOrder } });
});

module.exports = {
  listWorkOrders,
  getWorkOrder,
  actOnWorkOrder,
  addRequesterInfo,
};
