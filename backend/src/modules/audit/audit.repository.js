const pool = require('../../config/db');

async function listLogs({ limit, offset, action, entityType, search, from, to }) {
  const conditions = [];
  const values = [];
  const addValue = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (action !== 'all') conditions.push(`log.action = ${addValue(action)}`);
  if (entityType !== 'all') conditions.push(`log.entity_type = ${addValue(entityType)}`);
  if (from) conditions.push(`log.changed_at >= ${addValue(from)}::DATE`);
  if (to) conditions.push(`log.changed_at < (${addValue(to)}::DATE + INTERVAL '1 day')`);
  if (search) {
    const pattern = addValue(`%${search.toLowerCase()}%`);
    conditions.push(`LOWER(CONCAT_WS(' ', log.entity_name, log.entity_key, log.reason, actor.name, log.entity_type, log.action)) LIKE ${pattern}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const fromClause = `FROM inventory_change_logs AS log
       LEFT JOIN users AS actor ON actor.id = log.changed_by_user_id`;
  const countValues = [...values];
  const limitPlaceholder = addValue(limit);
  const offsetPlaceholder = addValue(offset);

  const [logsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT log.id,
              log.entity_type AS "entityType",
              log.entity_key AS "entityId",
              log.entity_name AS "entityName",
              log.action,
              log.reason,
              log.old_values AS "oldValues",
              log.new_values AS "newValues",
              actor.name AS "changedBy",
              log.changed_at AS "changedAt"
         ${fromClause}
         ${whereClause}
        ORDER BY log.changed_at DESC, log.id DESC
        LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      values,
    ),
    pool.query(
      `SELECT COUNT(*)::INTEGER AS total
         ${fromClause}
         ${whereClause}`,
      countValues,
    ),
  ]);

  return {
    logs: logsResult.rows,
    total: countResult.rows[0].total,
    limit,
    offset,
  };
}

module.exports = { listLogs };
