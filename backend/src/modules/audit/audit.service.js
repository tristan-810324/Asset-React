const auditRepository = require('./audit.repository');
const { validateAuditLogFilters } = require('./audit.validation');

async function listLogs(query) {
  const filters = validateAuditLogFilters(query);
  return auditRepository.listLogs(filters);
}

// Only the actions this user performed, newest first. Used by the IT Admin History page.
async function listMyActivity(userId) {
  return { activity: await auditRepository.listUserActivity(userId, 500) };
}

module.exports = { listLogs, listMyActivity };
