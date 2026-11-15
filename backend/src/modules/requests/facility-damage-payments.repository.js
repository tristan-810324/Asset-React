// Request-level settlements for Facility Use returns where GSO marked one or more units Unserviceable.
// PayMongo rows live beside Loss & Damage settlements so the signed webhook and duplicate-event guard stay shared.
const pool = require('../../config/db');
const requestsRepository = require('./requests.repository');
const auditRepository = require('../audit/audit.repository');
const { getAvailableQuantity, refreshInventoryStatus } = require('../inventory/inventory.stock');

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

const SETTLEMENT_SELECT = `
  SELECT settlement.id::TEXT AS id,
         settlement.request_id::TEXT AS "requestId",
         settlement.resolution,
         settlement.reason,
         settlement.amount_centavos AS "amountCentavos",
         settlement.currency,
         settlement.status,
         settlement.assessed_at AS "decidedAt",
         (SELECT assessor.name FROM users AS assessor WHERE assessor.id = settlement.assessed_by_user_id) AS "assessedBy",
         settlement.paymongo_link_id AS "linkId",
         settlement.paymongo_checkout_url AS "checkoutUrl",
         settlement.paymongo_reference_number AS "linkReference",
         settlement.link_created_at AS "linkCreatedAt",
         (SELECT creator.name FROM users AS creator WHERE creator.id = settlement.link_created_by_user_id) AS "linkCreatedBy",
         settlement.paymongo_payment_id AS "paymentId",
         settlement.paid_at AS "paidAt",
         settlement.updated_at AS "updatedAt",
         settlement.facility_asset_ids AS "facilityAssetIds"
    FROM loss_damage_settlements AS settlement`;

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

async function getSettlement(queryable, requestId) {
  const result = await (queryable || pool).query(
    `${SETTLEMENT_SELECT} WHERE settlement.request_id = $1 AND settlement.facility_asset_ids IS NOT NULL`,
    [requestId],
  );
  return result.rows[0] || null;
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

async function inventoryAfterFacilityPayment(client, assets) {
  const itemIds = [...new Set(assets.map((asset) => String(asset.item_id)).filter(Boolean))];
  const inventory = [];
  for (const itemId of itemIds) {
    const result = await client.query(
      `SELECT id, item_code, COALESCE(NULLIF(item_name, ''), description) AS item_name,
              quantity, unit_of_measure
         FROM item_catalog
        WHERE id = $1
        FOR UPDATE`,
      [itemId],
    );
    const item = result.rows[0];
    if (!item) continue;
    const inventoryStatus = await refreshInventoryStatus(client, item.id);
    const availableQuantity = await getAvailableQuantity(client, item);
    inventory.push({
      itemId: String(item.id),
      itemCode: item.item_code,
      itemName: item.item_name,
      unitOfMeasure: item.unit_of_measure,
      totalQuantity: Number(item.quantity),
      availableQuantity,
      inventoryStatus,
    });
  }
  return inventory;
}

function inventorySummary(inventory) {
  if (!inventory.length) return 'Item Master Data was refreshed.';
  return inventory
    .map((item) => `${item.availableQuantity} ${item.unitOfMeasure} of ${item.itemName} now available in Item Master Data`)
    .join('; ');
}

async function saveDecision({ requestId, userId, resolution, reason, amountCentavos }) {
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
    if (existing && existing.status !== 'PENDING_LINK') {
      throw httpError(409, existing.status === 'AWAITING_PAYMENT' ? 'A payment link is already waiting for the requester.' : 'The damage settlement is already complete.');
    }

    const status = resolution === 'PAYMENT_REQUIRED' ? 'PENDING_LINK' : 'NO_CHARGE';
    await client.query(
      `INSERT INTO loss_damage_settlements (
         request_id, resolution, reason, amount_centavos, status, assessed_by_user_id, facility_asset_ids
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::BIGINT[])
       ON CONFLICT (request_id) DO UPDATE SET
         resolution = EXCLUDED.resolution,
         reason = EXCLUDED.reason,
         amount_centavos = EXCLUDED.amount_centavos,
         status = EXCLUDED.status,
         assessed_by_user_id = EXCLUDED.assessed_by_user_id,
         facility_asset_ids = EXCLUDED.facility_asset_ids,
         assessed_at = NOW(),
         updated_at = NOW()`,
      [requestId, resolution, reason, amountCentavos, status, userId, assets.map((asset) => String(asset.id))],
    );
    if (resolution === 'NO_CHARGE') {
      await markAssetsSettled(client, assets, {
        status: 'Waived', note: reason, userId, requestReference: request.reference_no, requestId,
      });
    }
    await client.query(
      `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
       VALUES ($1, $2, $2, $3, $4)`,
      [requestId, request.status, `Facility damage decision: ${resolution === 'PAYMENT_REQUIRED' ? 'Payment required' : 'Waived'}. ${reason}`, userId],
    );
    return {
      request: await requestsRepository.getById(client, requestId),
      changed: Boolean(existing),
      settlement: await getSettlement(client, requestId),
      damagedItems: assets.map((asset) => ({ itemName: asset.item_name, damaged: Number(asset.damaged_quantity), unit: asset.unit_of_measure })),
    };
  });
}

async function attachLink({ requestId, amountCentavos, link, userId, note }) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE loss_damage_settlements
          SET status = 'AWAITING_PAYMENT',
              paymongo_link_id = $3,
              paymongo_checkout_url = $4,
              paymongo_reference_number = $5,
              link_created_at = NOW(),
              link_created_by_user_id = $6,
              updated_at = NOW()
        WHERE request_id = $1 AND facility_asset_ids IS NOT NULL
          AND status = 'PENDING_LINK' AND amount_centavos = $2
        RETURNING id`,
      [requestId, amountCentavos, link.id, link.checkoutUrl, link.referenceNumber, userId],
    );
    if (!result.rowCount) return false;
    const current = (await client.query('SELECT status FROM service_requests WHERE id = $1', [requestId])).rows[0];
    await client.query(
      `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
       VALUES ($1, $2, $2, $3, $4)`,
      [requestId, current.status, note, userId],
    );
    return true;
  });
}

async function clearLink({ requestId, linkId, userId, note }) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE loss_damage_settlements
          SET status = 'PENDING_LINK',
              previous_link_ids = array_append(previous_link_ids, paymongo_link_id),
              paymongo_link_id = NULL,
              paymongo_checkout_url = NULL,
              paymongo_reference_number = NULL,
              link_created_at = NULL,
              link_created_by_user_id = NULL,
              updated_at = NOW()
        WHERE request_id = $1 AND facility_asset_ids IS NOT NULL
          AND status = 'AWAITING_PAYMENT' AND paymongo_link_id = $2
        RETURNING id`,
      [requestId, linkId],
    );
    if (!result.rowCount) return false;
    const current = (await client.query('SELECT status FROM service_requests WHERE id = $1', [requestId])).rows[0];
    await client.query(
      `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
       VALUES ($1, $2, $2, $3, $4)`,
      [requestId, current.status, note, userId],
    );
    return true;
  });
}

// Called by the signed PayMongo webhook transaction. The caller already locked the settlement row.
async function applyPayment(client, { settlement, paymentId, paidAt }) {
  const request = (await client.query(
    `SELECT id, reference_no, status FROM service_requests WHERE id = $1 FOR UPDATE`,
    [settlement.request_id],
  )).rows[0];
  if (!request) return { moved: [], summary: 'Facility request no longer exists.' };
  const assetIds = Array.isArray(settlement.facility_asset_ids) ? settlement.facility_asset_ids : [];
  const assets = (await client.query(
    `SELECT asset.id AS id, asset.item_id AS item_id, asset.damaged_quantity, asset.unit_of_measure,
            COALESCE(NULLIF(item_name, ''), description) AS item_name
       FROM service_request_assets AS asset
       JOIN item_catalog AS item ON item.id = asset.item_id
      WHERE asset.request_id = $1 AND asset.id = ANY($2::BIGINT[])
      FOR UPDATE OF asset`,
    [settlement.request_id, assetIds],
  )).rows;
  await client.query(
    `UPDATE service_request_assets
        SET settlement_status = 'Paid',
            settlement_note = 'Payment confirmed through PayMongo.',
            settled_at = COALESCE($2, NOW()),
            settled_by_user_id = NULL
      WHERE request_id = $1 AND id = ANY($3::BIGINT[])`,
    [settlement.request_id, paidAt, assetIds],
  );
  const moved = [];
  for (const asset of assets) {
    await markUnserviceable(client, asset, request.reference_no, request.id, null, `${asset.damaged_quantity} ${asset.unit_of_measure} of ${asset.item_name} from ${request.reference_no} was paid through PayMongo and marked Unserviceable.`);
    moved.push(`${asset.item_name} (${asset.damaged_quantity} ${asset.unit_of_measure}) marked Unserviceable`);
  }

  const pendingOtherSettlements = Number((await client.query(
    `SELECT COUNT(*)::INTEGER AS count
       FROM service_request_assets
      WHERE request_id = $1
        AND settlement_status = 'Pending'
        AND NOT (id = ANY($2::BIGINT[]))`,
    [request.id, assetIds],
  )).rows[0]?.count || 0);
  const completed = pendingOtherSettlements === 0;
  const nextStatus = completed ? 'Completed' : request.status;
  if (completed) {
    await client.query(
      `UPDATE service_requests
          SET status = $2,
              updated_at = NOW(),
              completed_at = NOW()
        WHERE id = $1 AND status IN ('For Repair', 'Returned')`,
      [request.id, nextStatus],
    );
  }
  const inventory = await inventoryAfterFacilityPayment(client, assets);
  const availableSummary = inventorySummary(inventory);
  const movedSummary = moved.join('; ') || 'The returned damaged items were marked Unserviceable.';
  const completionSummary = completed
    ? 'Facility request marked Completed.'
    : `${pendingOtherSettlements} other returned item${pendingOtherSettlements === 1 ? '' : 's'} still need settlement before the request can be completed.`;
  await client.query(
    `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
     VALUES ($1, $2, $3, $4, NULL)`,
    [request.id, request.status, nextStatus, `PayMongo confirmed the facility damage payment${paymentId ? ` (${paymentId})` : ''}. ${movedSummary}. ${completionSummary} ${availableSummary}`.slice(0, 2000)],
  );
  return {
    moved,
    summary: movedSummary,
    requestStatus: nextStatus,
    completed,
    pendingOtherSettlements,
    inventory,
    availableSummary,
  };
}

module.exports = {
  getSettlement,
  saveDecision,
  attachLink,
  clearLink,
  applyPayment,
};
