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
              returned_by_user_id = $6, damaged_quantity = $7, repair_owner = $8,
              settlement_status = CASE WHEN $4::INTEGER > 0 OR ($7::INTEGER > 0 AND $5 = 'Unserviceable') THEN 'Pending' END
        WHERE request_id = $1 AND id = $2 AND returned_at IS NULL
        RETURNING item_id, unit_of_measure`,
      [requestId, line.assetId, line.returned, line.lost, line.condition, userId, line.damaged || 0, line.repairOwner || null],
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

// Finance report: every facility item that came back (lost, damaged, or returned clean), with the requester who must account for it.
async function listFinanceReport() {
  const result = await pool.query(
    `SELECT request.id AS "requestId", request.reference_no AS "referenceNo", request.status AS "requestStatus",
            requester.name AS "accountableName", requester.email AS "accountableEmail",
            item.item_code AS "itemCode", COALESCE(NULLIF(item.item_name, ''), item.description) AS "itemName",
            asset.quantity, asset.returned_quantity AS "returnedQuantity", asset.lost_quantity AS "lostQuantity",
            asset.damaged_quantity AS "damagedQuantity", asset.condition_in AS "condition",
            asset.id AS "assetId", asset.repair_owner AS "repairOwner",
            asset.repaired_quantity AS "repairedQuantity", asset.unserviceable_quantity AS "unserviceableQuantity",
            asset.settlement_status AS "settlementStatus", asset.settlement_note AS "settlementNote",
            asset.write_off_decision AS "writeOffDecision", asset.write_off_estimated_value AS "writeOffEstimatedValue",
            asset.write_off_reason AS "writeOffReason",
            asset.issued_at AS "issuedAt", asset.returned_at AS "returnedAt"
       FROM service_request_assets AS asset
       JOIN service_requests AS request ON request.id = asset.request_id
       JOIN users AS requester ON requester.id = request.requested_by_user_id
       JOIN item_catalog AS item ON item.id = asset.item_id
      WHERE request.request_type = 'FACILITY_USE' AND (asset.lost_quantity > 0 OR asset.damaged_quantity > 0 OR asset.returned_at IS NOT NULL)
      ORDER BY request.created_at DESC, request.id DESC
      LIMIT 10000`,
  );
  return result.rows;
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

// Adds GSO's check counts to a GSO-owned Needs Repair row. The row must still have units waiting; the CHECK in
// migration 013 refuses counts above what is damaged, so a double save cannot push it past its total.
// Moves the stock too: repaired units leave the repair hold and go back to available stock; unserviceable units leave
// the hold and are written off from the item's quantity. Both are logged, and the To Be Repaired history reads the counts.
// shortcut: individually tracked units are not moved here, only quantity-tracked stock; upgrade when a unit-tracked item needs the check.
async function recordRepairCounts({ assetId, repaired, unserviceable, userId, writeOff = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query(
      `UPDATE service_request_assets
          SET repaired_quantity = repaired_quantity + $2::INTEGER, unserviceable_quantity = unserviceable_quantity + $3::INTEGER,
              write_off_reason = CASE WHEN $3::INTEGER > 0 THEN $4 ELSE write_off_reason END,
              write_off_decision = CASE WHEN $3::INTEGER > 0 THEN $5 ELSE write_off_decision END,
              write_off_estimated_value = CASE WHEN $3::INTEGER > 0 THEN $6::NUMERIC ELSE write_off_estimated_value END,
              write_off_by_user_id = CASE WHEN $3::INTEGER > 0 THEN $7::BIGINT ELSE write_off_by_user_id END,
              write_off_at = CASE WHEN $3::INTEGER > 0 THEN NOW() ELSE write_off_at END
        WHERE id = $1 AND condition_in = 'Needs Repair' AND damaged_quantity > 0 AND repair_owner IN ('GSO', 'ITSS')
          AND damaged_quantity - repaired_quantity - unserviceable_quantity >= ($2::INTEGER + $3::INTEGER)
        RETURNING request_id AS "requestId", item_id AS "itemId", unit_of_measure AS "unit", repair_owner AS "repairOwner"`,
      [assetId, repaired, unserviceable, writeOff?.reason ?? null, writeOff?.decision ?? null, writeOff?.estimatedValue ?? null, userId],
    )).rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return null;
    }
    const item = await lockItem(client, row.itemId);
    if (item && item.tracking_mode !== 'individual') {
      const hold = Math.max(Number(item.repair_quantity || 0) - repaired - unserviceable, 0);
      const quantity = Math.max(Number(item.quantity) - unserviceable, 0);
      await client.query('UPDATE item_catalog SET repair_quantity = $2, quantity = $3 WHERE id = $1', [row.itemId, hold, quantity]);
      await auditRepository.writeLog(client, {
        entityType: 'item',
        entityKey: item.item_code,
        entityName: item.name,
        action: 'returned',
        reason: `GSO repair check: ${repaired} ${row.unit} repaired and back to stock; ${unserviceable} ${row.unit} unserviceable and written off.`,
        oldValues: { quantity: Number(item.quantity), repairQuantity: Number(item.repair_quantity || 0) },
        newValues: { quantity, repairQuantity: hold, repaired, unserviceable },
        changedByUserId: userId,
        itemId: row.itemId,
        requestId: row.requestId,
      });
      await refreshInventoryStatus(client, row.itemId);
    }
    await client.query('COMMIT');
    return row;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// How many damaged items in this request still wait for the GSO check.
async function countOpenRepairs(requestId) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(damaged_quantity - repaired_quantity - unserviceable_quantity), 0)::INTEGER AS n
       FROM service_request_assets
      WHERE request_id = $1 AND condition_in = 'Needs Repair' AND damaged_quantity > 0`,
    [requestId],
  );
  return result.rows[0].n;
}

module.exports = {
  recordFacilityReturn,
  settleFacilityItem,
  listFinanceReport,
  recordSlipPrints,
  claimOverdueFacilityReminders,
  recordRepairCounts,
  countOpenRepairs,
};
