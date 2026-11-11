const pool = require('../../config/db');

async function listLogs({ limit, offset, action, entityType, flag = 'all', search, from, to }) {
  const conditions = [];
  const values = [];
  const addValue = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (action !== 'all') conditions.push(`log.action = ${addValue(action)}`);
  if (entityType !== 'all') conditions.push(`log.entity_type = ${addValue(entityType)}`);
  if (flag === 'any') conditions.push('log.flag IS NOT NULL');
  else if (flag !== 'all') conditions.push(`log.flag = ${addValue(flag)}`);
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

  const [logsResult, countResult, flaggedResult] = await Promise.all([
    pool.query(
      `SELECT log.id,
              log.entity_type AS "entityType",
              log.entity_key AS "entityId",
              log.entity_name AS "entityName",
              log.action,
              log.flag,
              log.request_id AS "requestId",
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
    // Shown as a reminder on the page, whatever filter is active.
    pool.query(
      `SELECT COUNT(*)::INTEGER AS total
         FROM inventory_change_logs
        WHERE flag IS NOT NULL AND changed_at >= NOW() - INTERVAL '30 days'`,
    ),
  ]);

  return {
    logs: logsResult.rows,
    total: countResult.rows[0].total,
    flaggedLast30Days: flaggedResult.rows[0].total,
    limit,
    offset,
  };
}

// Records one audit entry. Pass a transaction client when the change is part of one.
async function writeLog(db, {
  entityType, entityKey, entityName, action, reason,
  oldValues = {}, newValues = {}, changedByUserId = null,
  itemId = null, employeeId = null, requestId = null, flag = null,
}) {
  await (db || pool).query(
    `INSERT INTO inventory_change_logs (
       entity_type, entity_key, entity_name, item_id, employee_id, request_id, action, reason,
       old_values, new_values, changed_by_user_id, flag
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::JSONB, $10::JSONB, $11, $12)`,
    [entityType, String(entityKey), entityName || String(entityKey), itemId, employeeId, requestId, action,
      reason, JSON.stringify(oldValues), JSON.stringify(newValues), changedByUserId, flag],
  );
}

module.exports = { listLogs, writeLog };
