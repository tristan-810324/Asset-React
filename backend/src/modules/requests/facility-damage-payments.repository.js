// Request-level no-charge settlements for Facility Use returns where GSO marked one or more units Unserviceable.
const pool = require('../../config/db');
const requestsRepository = require('./requests.repository');
const auditRepository = require('../audit/audit.repository');
const { refreshInventoryStatus } = require('../inventory/inventory.stock');

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function pendingDamageAssets(client, requestId) {
  return (await client.query(
    `SELECT asset.id, asset.item_id, asset.damaged_quantity, asset.unit_of_measure,
            asset.condition_in, item.item_code, COALESCE(NULLIF(item.item_name, ''), item.description) AS item_name,
            item.tracking_mode, item.quantity, item.repair_quantity
       FROM service_request_assets AS asset
       JOIN item_catalog AS item ON item.id = asset.item_id
      WHERE asset.request_id = $1
        AND asset.damaged_quantity > 0
        AND asset.condition_in = 'Unserviceable'
        AND asset.settlement_status = 'Pending'
      ORDER BY asset.id
      FOR UPDATE OF asset, item`,
    [requestId],
  )).rows;
}

async function markUnserviceable(client, asset, requestReference, requestId, userId, reason) {
  const item = (await client.query(
    `SELECT id, item_code, COALESCE(NULLIF(item_name, ''), description) AS name,
            quantity, repair_quantity, tracking_mode, condition
       FROM item_catalog WHERE id = $1 FOR UPDATE`,
    [asset.item_id],
  )).rows[0];
  if (!item) return;

  const damaged = Math.max(Number(asset.damaged_quantity || 0), 1);
  if (item.tracking_mode === 'individual') {
    await client.query(
      `UPDATE item_catalog SET condition = 'Unserviceable' WHERE id = $1`,
      [item.id],
    );
  } else {
    // The return transaction already added this damaged quantity to the repair hold. Keep the
    // existing hold when the settlement is recorded so payment/waiver does not double-count it.
    const held = Math.min(Number(item.quantity), Math.max(Number(item.repair_quantity || 0), damaged));
    await client.query(
      `UPDATE item_catalog
          SET repair_quantity = $2,
              condition = CASE WHEN quantity <= $2 THEN 'Unserviceable' ELSE condition END
        WHERE id = $1`,
      [item.id, held],
    );
  }
  const inventoryStatus = await refreshInventoryStatus(client, item.id);
  await auditRepository.writeLog(client, {
    entityType: 'item',
    entityKey: item.item_code,
    entityName: item.name,
    action: 'updated',
    reason,
    oldValues: { condition: item.condition, repairQuantity: Number(item.repair_quantity || 0) },
    newValues: { condition: 'Unserviceable', requestReference, inventoryStatus },
    changedByUserId: userId,
    itemId: item.id,
    requestId,
  });
}

async function markAssetsSettled(client, assets, { status, note, userId, requestReference, requestId }) {
  for (const asset of assets) {
    await client.query(
      `UPDATE service_request_assets
          SET settlement_status = $2,
              settlement_note = $3,
              settled_at = NOW(),
              settled_by_user_id = $4
        WHERE id = $1`,
      [asset.id, status, note || null, userId],
    );
    await markUnserviceable(client, asset, requestReference, requestId, userId, `${asset.damaged_quantity} ${asset.unit_of_measure} of ${asset.item_name} from ${requestReference} marked Unserviceable and settled as ${status}.`);
  }
}

async function saveDecision({ requestId, userId, reason }) {
  return withTransaction(async (client) => {
    const request = (await client.query(
      `SELECT id, reference_no, request_type, status FROM service_requests WHERE id = $1 FOR UPDATE`,
      [requestId],
    )).rows[0];
    if (!request || request.request_type !== 'FACILITY_USE') throw httpError(404, 'Facility request not found.');
    if (!['For Repair', 'Returned'].includes(request.status)) throw httpError(409, 'The facility return is not ready for damage settlement.');

    const assets = await pendingDamageAssets(client, requestId);
    if (!assets.length) throw httpError(409, 'There are no unserviceable returned items waiting for a decision. Refresh the request.');
    const existing = (await client.query(
      `SELECT id, status, resolution FROM loss_damage_settlements
        WHERE request_id = $1 AND facility_asset_ids IS NOT NULL FOR UPDATE`,
      [requestId],
    )).rows[0] || null;
    if (existing && existing.status === 'NO_CHARGE') {
      throw httpError(409, 'The damage settlement is already complete.');
    }

    await client.query(
      `INSERT INTO loss_damage_settlements (
         request_id, resolution, reason, status, assessed_by_user_id, facility_asset_ids
       ) VALUES ($1, $2, $3, $4, $5, $6::BIGINT[])
       ON CONFLICT (request_id) DO UPDATE SET
          resolution = 'NO_CHARGE',
         reason = EXCLUDED.reason,
          status = 'NO_CHARGE',
         assessed_by_user_id = EXCLUDED.assessed_by_user_id,
          facility_asset_ids = EXCLUDED.facility_asset_ids,
         assessed_at = NOW(),
         updated_at = NOW()`,
       [requestId, 'NO_CHARGE', reason, 'NO_CHARGE', userId, assets.map((asset) => String(asset.id))],
    );
    await markAssetsSettled(client, assets, {
      status: 'Waived', note: reason, userId, requestReference: request.reference_no, requestId,
    });
    await client.query(
      `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
       VALUES ($1, $2, $2, $3, $4)`,
       [requestId, request.status, `Facility damage decision: No charge. ${reason}`, userId],
    );
    return {
      request: await requestsRepository.getById(client, requestId),
      changed: Boolean(existing),
      damagedItems: assets.map((asset) => ({ itemName: asset.item_name, damaged: Number(asset.damaged_quantity), unit: asset.unit_of_measure })),
    };
  });
}

module.exports = {
  saveDecision,
};
