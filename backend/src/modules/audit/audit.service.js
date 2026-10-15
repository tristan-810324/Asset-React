const auditRepository = require('./audit.repository');
const { validateAuditLogFilters } = require('./audit.validation');

async function listLogs(query) {
  const filters = validateAuditLogFilters(query);
  return auditRepository.listLogs(filters);
}

module.exports = { listLogs };
