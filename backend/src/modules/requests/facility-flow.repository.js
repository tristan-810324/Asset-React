// Facilities and equipment requests after approval: returns, missing items, slips, and overdue reminders.
const pool = require('../../config/db');
const auditRepository = require('../audit/audit.repository');
const { refreshInventoryStatus } = require('../inventory/inventory.stock');

const httpError = (status, message) => Object.assign(new Error(message), { status });

async function lockItem(client, itemId) {
  const result = await client.query(
    `SELECT id, item_code, COALESCE(NULLIF(item_name, ''), description) AS name,
            quantity, repair_quantity, tracking_mode, condition
       FROM item_catalog
      WHERE id = $1
      FOR UPDATE`,
    [itemId],
  );
  return result.rows[0];
}

// Saves what came back for each released row. Missing units leave the stock at once and wait for settlement,
// the same rule as a lost employee issuance (returns.repository.js).
async function recordFacilityReturn(client, { requestId, referenceNo, lines, userId }) {
  for (const line of lines) {
    const saved = await client.query(
      `UPDATE service_request_assets
          SET returned_quantity = $3, lost_quantity = $4, condition_in = $5, returned_at = NOW(),
              returned_by_user_id = $6, damaged_quantity = $7,
              settlement_status = CASE WHEN $4::INTEGER > 0 OR ($7::INTEGER > 0 AND $5 = 'Unserviceable') THEN 'Pending' END
        WHERE request_id = $1 AND id = $2 AND returned_at IS NULL
        RETURNING item_id, unit_of_measure`,
      [requestId, line.assetId, line.returned, line.lost, line.condition, userId, line.damaged || 0],
    );
    if (saved.rowCount !== 1) throw httpError(409, 'This return was already recorded. Refresh the list.');
    const { item_id: itemId, unit_of_measure: unit } = saved.rows[0];
    if (line.damaged > 0) {
      const item = await lockItem(client, itemId);
      if (item) {
        if (item.tracking_mode === 'individual') {
          await client.query(
            `UPDATE item_catalog
                SET condition = $2
              WHERE id = $1`,
            [itemId, line.condition],
          );
        } else {
          const repairQuantity = Math.min(Number(item.quantity), Number(item.repair_quantity || 0) + Number(line.damaged));
          await client.query(
            `UPDATE item_catalog
                SET repair_quantity = $2,
                    condition = CASE WHEN quantity <= $2 AND $3 = 'Unserviceable' THEN 'Unserviceable' ELSE condition END
              WHERE id = $1`,
            [itemId, repairQuantity, line.condition],
          );
        }
        await auditRepository.writeLog(client, {
          entityType: 'item',
          entityKey: item.item_code,
          entityName: item.name,
          action: 'returned',
          reason: `${line.damaged} ${unit} returned damaged as ${line.condition} for ${referenceNo}.`,
          oldValues: { condition: item.condition, repairQuantity: Number(item.repair_quantity || 0) },
          newValues: { condition: line.condition, damagedQuantity: line.damaged, requestReference: referenceNo },
          changedByUserId: userId,
          itemId,
          requestId,
        });
      }
    }
    if (line.lost > 0) {
      const item = await lockItem(client, itemId);
      const newQuantity = Math.max(Number(item.quantity) - line.lost, 0);
      await client.query('UPDATE item_catalog SET quantity = $2 WHERE id = $1', [itemId, newQuantity]);
      await auditRepository.writeLog(client, {
        entityType: 'item',
        entityKey: itemId,
        entityName: item.name,
        action: 'returned',
        reason: `${line.lost} ${unit} not returned for ${referenceNo}. Removed from stock until settled.`,
        oldValues: { quantity: Number(item.quantity) },
        newValues: { quantity: newQuantity, returnStatus: 'Lost', missingQuantity: line.lost, requestReference: referenceNo },
        changedByUserId: userId,
        itemId,
        requestId,
        flag: 'ITEM_LOST',
      });
    }
    await refreshInventoryStatus(client, itemId);
  }
}

// Any GSO staff member can settle, including the one who recorded the return (user's rule, 2026-11-15).
// Replaced puts the missing units back in stock. Paid and Waived leave them out, because they never came back.
async function settleFacilityItem({ requestId, assetId, status, note, userId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT asset.item_id, asset.lost_quantity, asset.unit_of_measure, asset.settlement_status,
              request.reference_no, request.request_type
         FROM service_request_assets AS asset
         JOIN service_requests AS request ON request.id = asset.request_id
        WHERE asset.id = $1 AND asset.request_id = $2
        FOR UPDATE OF asset`,
      [assetId, requestId],
    );
    const row = found.rows[0];
    if (!row || row.request_type !== 'FACILITY_USE') throw httpError(404, 'Item record not found.');
    if (row.settlement_status !== 'Pending') throw httpError(409, 'This item is already settled. Refresh the list.');
    const lost = Number(row.lost_quantity);
    const item = await lockItem(client, row.item_id);
    const newQuantity = status === 'Replaced' ? Number(item.quantity) + lost : Number(item.quantity);
    if (status === 'Replaced') {
      await client.query('UPDATE item_catalog SET quantity = $2 WHERE id = $1', [row.item_id, newQuantity]);
      await refreshInventoryStatus(client, row.item_id);
    }
    await client.query(
      `UPDATE service_request_assets
          SET settlement_status = $2, settlement_note = $3, settled_at = NOW(), settled_by_user_id = $4
        WHERE id = $1`,
      [assetId, status, note || null, userId],
    );
    await auditRepository.writeLog(client, {
      entityType: 'item',
      entityKey: row.item_id,
      entityName: item.name,
      action: 'updated',
      reason: `Missing ${lost} ${row.unit_of_measure} from ${row.reference_no} settled as ${status}.${note ? ` Note: ${note}` : ''}`,
      oldValues: { settlementStatus: 'Pending', quantity: Number(item.quantity) },
      newValues: { settlementStatus: status, quantity: newQuantity, requestReference: row.reference_no },
      changedByUserId: userId,
      itemId: row.item_id,
      requestId,
      flag: 'ITEM_LOST',
    });
    await client.query('COMMIT');
    return { itemName: item.name, lost, unit: row.unit_of_measure };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// A requester with a missing item that is not settled cannot request equipment again.
async function hasUnsettledItems(queryable, userId) {
  const result = await (queryable || pool).query(
    `SELECT 1
       FROM service_request_assets AS asset
       JOIN service_requests AS request ON request.id = asset.request_id
      WHERE request.requested_by_user_id = $1 AND asset.settlement_status = 'Pending'
      LIMIT 1`,
    [userId],
  );
  return result.rowCount > 0;
}

// The first print is kept; later prints are reprints, which need a reason (see the service).
async function recordSlipPrints(requestIds, userId) {
  const result = await pool.query(
    `UPDATE service_requests
        SET slip_printed_at = COALESCE(slip_printed_at, NOW()),
            slip_printed_by_user_id = COALESCE(slip_printed_by_user_id, $2)
      WHERE id = ANY($1::BIGINT[])
        AND request_type = 'FACILITY_USE'
        AND status IN ('Approved', 'Issued')
        AND EXISTS (SELECT 1 FROM service_request_assets AS asset WHERE asset.request_id = service_requests.id)
      RETURNING id::TEXT AS id, reference_no AS "referenceNo"`,
    [requestIds, userId],
  );
  return result.rows;
}

// Released facility requests whose end time has passed get one reminder every 23 hours until they are returned.
// SKIP LOCKED lets two server instances run this at the same time without sending twice.
async function claimOverdueFacilityReminders(limit = 10) {
  const result = await pool.query(
    `UPDATE service_requests
        SET overdue_reminded_at = NOW()
      WHERE id IN (
        SELECT id
          FROM service_requests
         WHERE request_type = 'FACILITY_USE'
           AND status = 'Issued'
           AND CASE WHEN form_data->>'date' ~ '^\\d{4}-\\d{2}-\\d{2}$' AND form_data->>'endTime' ~ '^\\d{2}:\\d{2}$'
                    THEN ((form_data->>'date') || ' ' || (form_data->>'endTime'))::TIMESTAMP
               END < (NOW() AT TIME ZONE 'Asia/Manila')
           AND (overdue_reminded_at IS NULL OR overdue_reminded_at < NOW() - INTERVAL '23 hours')
         ORDER BY id
         LIMIT $1
         FOR UPDATE SKIP LOCKED)
      RETURNING id::TEXT AS id`,
    [limit],
  );
  return result.rows.map((row) => row.id);
}

module.exports = {
  recordFacilityReturn,
  settleFacilityItem,
  hasUnsettledItems,
  recordSlipPrints,
  claimOverdueFacilityReminders,
};
