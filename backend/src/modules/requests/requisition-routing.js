// Routing rules for each item on a purchase requisition. Pure functions, so the rules are easy to test.

const STAFF_ROUTES = new Set(['ISSUE', 'HEAD_ISSUE', 'PURCHASE']);

// The routes GSO Staff may pick for an item; the first one is the default.
// In-stock items marked for the GSO Head, or above a staff quantity limit, must go to the Head.
// Other in-stock items can be issued by GSO Staff or escalated. A shortage always needs purchase approval.
function staffRouteOptions({
  requestedQuantity,
  availableQuantity,
  approvalPolicy = 'STAFF_ISSUE',
  staffIssueMaxQuantity = null,
}) {
  if (availableQuantity < requestedQuantity) return ['PURCHASE'];

  const exceedsStaffLimit = staffIssueMaxQuantity !== null
    && staffIssueMaxQuantity !== undefined
    && requestedQuantity > Number(staffIssueMaxQuantity);
  if (approvalPolicy === 'GSO_HEAD' || exceedsStaffLimit) return ['HEAD_ISSUE'];

  return ['ISSUE', 'HEAD_ISSUE'];
}

const financeStatuses = new Set([
  'GSO Endorsed', 'Finance Handoff Pending', 'Finance Handoff Failed', 'Sent to Finance',
]);

const nameWords = (value) => String(value || '').toLowerCase().match(/[a-z0-9]+/g) || [];

// How an inventory record's name compares with a requested item's name when GSO Staff link a delivery:
// EXACT is the same name; SIMILAR is one name inside the other ("Webcam" and "USB Webcam 1080p"),
// which staff must confirm; null is a different item.
function nameMatch(requestedName, inventoryName) {
  if (String(requestedName).trim().toLowerCase() === String(inventoryName).trim().toLowerCase()) return 'EXACT';
  const requested = new Set(nameWords(requestedName));
  const inventory = new Set(nameWords(inventoryName));
  if (!requested.size || !inventory.size) return null;
  const [smaller, larger] = requested.size <= inventory.size ? [requested, inventory] : [inventory, requested];
  return [...smaller].every((word) => larger.has(word)) ? 'SIMILAR' : null;
}

// The request status says whose turn it is; every item keeps its own route status.
function nextRequisitionStatus(routeStatuses, currentStatus) {
  const has = (...statuses) => routeStatuses.some((status) => statuses.includes(status));
  if (has('NEEDS_INFORMATION')) return 'Needs Information';
  if (has('WAITING_STAFF_REVIEW')) return 'Submitted';
  if (has('WAITING_GSO_HEAD')) return 'Under Review';
  if (financeStatuses.has(currentStatus)) return currentStatus;
  if (has('WAITING_FINANCE', 'WAITING_FOR_PURCHASE', 'PARTIAL_STOCK')) return 'GSO Endorsed';
  if (has('READY_FOR_STAFF', 'PARTIALLY_ISSUED', 'HANDOVER_PENDING')) return 'Approved';
  if (has('ISSUED')) return 'Completed';
  return 'Rejected';
}

module.exports = { STAFF_ROUTES, staffRouteOptions, nextRequisitionStatus, nameMatch };
