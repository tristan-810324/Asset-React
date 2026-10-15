const actions = new Set(['created', 'updated', 'renamed', 'deleted']);
const entityTypes = new Set(['item', 'category', 'employee']);

function invalid(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function parseDate(value, label) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalid(`${label} ay dapat valid na petsa.`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    invalid(`${label} ay dapat valid na petsa.`);
  }
  return value;
}

function validateAuditLogFilters(query) {
  const limitValue = query.limit === undefined ? 25 : Number(query.limit);
  const offsetValue = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 100) {
    invalid('Hindi valid ang audit log page size.');
  }
  if (!Number.isInteger(offsetValue) || offsetValue < 0 || offsetValue > 2000000000) {
    invalid('Hindi valid ang audit log page offset.');
  }

  const action = query.action === undefined ? 'all' : query.action;
  const entityType = query.entityType === undefined ? 'all' : query.entityType;
  if (action !== 'all' && !actions.has(action)) invalid('Hindi valid ang audit log action filter.');
  if (entityType !== 'all' && !entityTypes.has(entityType)) invalid('Hindi valid ang audit log type filter.');

  const search = query.search === undefined ? '' : String(query.search).trim();
  if (search.length > 200) invalid('Hindi dapat lumampas sa 200 characters ang search.');

  const from = parseDate(query.from, 'Petsa mula');
  const to = parseDate(query.to, 'Petsa hanggang');
  if (from && to && from > to) invalid('Hindi puwedeng mas huli ang petsa mula kaysa petsa hanggang.');

  return { limit: limitValue, offset: offsetValue, action, entityType, search, from, to };
}

module.exports = { validateAuditLogFilters };
