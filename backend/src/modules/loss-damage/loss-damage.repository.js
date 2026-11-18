// Loss & Damage Cases storage. The report is a service_requests row (LOSS_DAMAGE_REPORT);
// loss_damage_settlements stores the GSO resolution and its custody hand-off.
const crypto = require('node:crypto');
const pool = require('../../config/db');
const requestsRepository = require('../requests/requests.repository');
const auditRepository = require('../audit/audit.repository');
const { refreshInventoryStatus } = require('../inventory/inventory.stock');
const { retireUnitLabel } = require('../issuances/labels.repository');

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

const SETTLEMENT_SELECT = `
  SELECT settlement.id::TEXT AS id,
         settlement.request_id::TEXT AS "requestId",
         settlement.resolution,
         settlement.reason,
         settlement.status,
         settlement.assessed_at AS "assessedAt",
         (SELECT assessor.name FROM users AS assessor WHERE assessor.id = settlement.assessed_by_user_id) AS "assessedBy",
         settlement.custody_resolved_at AS "custodyResolvedAt",
         settlement.custody_resolution_summary AS "custodyResolutionSummary",
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

async function listSettlements(requestIds) {
  if (!requestIds.length) return new Map();
  const result = await pool.query(`${SETTLEMENT_SELECT} WHERE settlement.request_id = ANY($1::BIGINT[])`, [requestIds]);
  return new Map(result.rows.map((row) => [row.requestId, row]));
}

async function getSettlement(queryable, requestId) {
  const result = await (queryable || pool).query(`${SETTLEMENT_SELECT} WHERE settlement.request_id = $1`, [requestId]);
  return result.rows[0] || null;
}

// Locks the report and its settlement (if any) for the rest of the transaction.
async function lockCase(client, id) {
  const request = (await client.query(
    'SELECT id, reference_no, request_type, status, form_data FROM service_requests WHERE id = $1 FOR UPDATE',
    [id],
  )).rows[0];
  if (!request || request.request_type !== 'LOSS_DAMAGE_REPORT') throw httpError(404, 'Loss / damage case not found.');
  const settlement = (await client.query(
    `SELECT id, status, resolution, custody_resolved_at, custody_resolution_summary
       FROM loss_damage_settlements
      WHERE request_id = $1
      FOR UPDATE`,
    [id],
  )).rows[0] || null;
  return { request, settlement };
}

async function addHistory(client, { id, previousStatus, status, note, userId }) {
  await client.query(
    `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, previousStatus, status, String(note || '').slice(0, 2000), userId],
  );
}

async function setRequestStatus(client, id, status) {
  await client.query(
    `UPDATE service_requests
        SET status = $2,
            updated_at = NOW(),
            completed_at = CASE WHEN $2 = 'Closed' THEN NOW() ELSE NULL END
      WHERE id = $1`,
    [id, status],
  );
}

// A note on the request timeline without a status change.
async function addTimelineNote(client, id, note, userId) {
  const { status } = (await client.query('UPDATE service_requests SET updated_at = NOW() WHERE id = $1 RETURNING status', [id])).rows[0];
  await addHistory(client, { id, previousStatus: status, status, note, userId });
}

// Submitted (or a report sent back to the requester) -> Under Review.
async function startReview({ id, userId }) {
  return withTransaction(async (client) => {
    const { request } = await lockCase(client, id);
    if (!['Submitted', 'Needs Information'].includes(request.status)) {
      throw httpError(409, `This report is already ${request.status.toLowerCase()}. Refresh the page.`);
    }
    await setRequestStatus(client, id, 'Under Review');
    await addHistory(client, { id, previousStatus: request.status, status: 'Under Review', note: 'GSO Staff started reviewing the report.', userId });
    return requestsRepository.getById(client, id);
  });
}

// Reports decided before this workspace existed can still be Approved or In Progress without a settlement.
const DECIDABLE_STATUSES = ['Under Review', 'Approved', 'In Progress'];

// Saves a GSO decision. No charge resolves custody atomically and closes the report. For repair stays open
// until closeCase confirms the physical follow-up.
async function saveDecision({ id, userId, resolution, reason, summary, resolvedUnits }) {
  return withTransaction(async (client) => {
    const { request, settlement } = await lockCase(client, id);
    if (!settlement && !DECIDABLE_STATUSES.includes(request.status)) {
      throw httpError(409, ['Submitted', 'Needs Information'].includes(request.status)
        ? 'Start the review before you decide.'
        : `This case is ${request.status.toLowerCase()} and cannot be decided.`);
    }
    if (settlement && !(request.status === 'In Progress' && settlement.status === 'FOR_REPAIR' && !settlement.custody_resolved_at)) {
      throw httpError(409, 'This decision can no longer be changed.');
    }

    const resolvedItems = await resolveUnidentifiedUnits(client, request.form_data, resolvedUnits);
    if (resolvedItems) {
      await client.query(
        `UPDATE service_requests
            SET form_data = jsonb_set(form_data, '{items}', $2::JSONB), updated_at = NOW()
          WHERE id = $1`,
        [id, JSON.stringify(resolvedItems)],
      );
    }

    const changed = Boolean(settlement);
    const saved = (await client.query(
      `INSERT INTO loss_damage_settlements (request_id, resolution, reason, status, assessed_by_user_id)
       VALUES ($1, $2, $3, $2, $4)
       ON CONFLICT (request_id) DO UPDATE SET
         resolution = EXCLUDED.resolution,
         reason = EXCLUDED.reason,
         status = EXCLUDED.status,
         assessed_by_user_id = EXCLUDED.assessed_by_user_id,
         assessed_at = NOW(),
         updated_at = NOW()
       RETURNING id, custody_resolved_at, custody_resolution_summary`,
      [id, resolution, reason, userId],
    )).rows[0];

    let inventory = null;
    if (resolution === 'NO_CHARGE') {
      inventory = await resolveCaseCustody(client, {
        settlement: saved,
        requestId: id,
        referenceNo: request.reference_no,
        incidentType: request.form_data?.incidentType,
        reportedItems: resolvedItems || (Array.isArray(request.form_data?.items) ? request.form_data.items : []),
        resolution,
        userId,
      });
    }

    const requestStatus = resolution === 'NO_CHARGE' ? 'Closed' : 'In Progress';
    await setRequestStatus(client, id, requestStatus);
    await addHistory(client, {
      id,
      previousStatus: request.status,
      status: requestStatus,
      note: `${changed ? 'Decision changed' : 'Decision'}: ${summary}. Reason: ${reason}`,
      userId,
    });
    return { request: await requestsRepository.getById(client, id), changed, inventory };
  });
}

// An unidentified barcode-tracked loss must be resolved to the exact issued unit(s) before GSO can decide the case.
// The candidate list was copied from the issuance when the report was submitted; recheck custody under lock here.
async function resolveUnidentifiedUnits(client, formData, resolvedUnits) {
  const items = Array.isArray(formData?.items) ? formData.items : [];
  const unresolved = items.filter((row) => row?.identityUnknown === true);
  if (unresolved.length === 0) {
    if (Array.isArray(resolvedUnits) && resolvedUnits.length > 0) throw httpError(400, 'This report has no unidentified units to resolve.');
    return null;
  }
  if (!Array.isArray(resolvedUnits) || resolvedUnits.length !== unresolved.length) {
    throw httpError(400, 'Identify every reported unit before saving the decision.');
  }

  const resolutionByIssuance = new Map();
  for (const choice of resolvedUnits) {
    const issuanceId = String(choice?.issuanceId ?? '');
    if (!choice || typeof choice !== 'object' || !/^\d{1,20}$/.test(issuanceId) || !Array.isArray(choice.tagCodes) || resolutionByIssuance.has(issuanceId)) {
      throw httpError(400, 'The selected asset tags are not valid. Refresh the case and try again.');
    }
    resolutionByIssuance.set(issuanceId, choice.tagCodes.map((tagCode) => String(tagCode)));
  }

  const replacements = new Map();
  for (const row of unresolved) {
    const issuanceId = String(row.issuanceId ?? '');
    const tagCodes = resolutionByIssuance.get(issuanceId);
    const candidates = new Set((Array.isArray(row.candidateUnits) ? row.candidateUnits : []).map((candidate) => String(candidate?.tagCode ?? '')));
    if (!tagCodes || tagCodes.length !== Number(row.quantity) || new Set(tagCodes).size !== tagCodes.length
      || tagCodes.some((tagCode) => !tagCode || !candidates.has(tagCode))) {
      throw httpError(400, `Select exactly ${Number(row.quantity)} valid asset tag${Number(row.quantity) === 1 ? '' : 's'} for ${row.description || 'the reported item'}.`);
    }
    const current = await client.query(
      `SELECT tag_code FROM asset_unit_tags
        WHERE issuance_id = $1 AND tag_code = ANY($2::TEXT[])
          AND custody_status = 'Issued' AND lifecycle_status = 'Active'
        FOR UPDATE`,
      [issuanceId, tagCodes],
    );
    if (current.rowCount !== tagCodes.length) {
      throw httpError(409, `One of the selected units for ${row.description || 'the reported item'} is no longer issued. Refresh the case and review it again.`);
    }
    replacements.set(issuanceId, tagCodes.map((tagCode) => ({
      ...row,
      tagCode,
      assetCode: tagCode,
      quantity: 1,
      identityUnknown: false,
      candidateUnits: undefined,
    })));
  }
  if (resolutionByIssuance.size !== unresolved.length) throw httpError(400, 'The selected asset tags do not match this report.');
  return items.flatMap((row) => row?.identityUnknown === true ? (replacements.get(String(row.issuanceId)) || []) : [row]);
}

// Resolving custody is explicitly tied to a GSO decision/closure. The settlement row is locked by the caller;
// the timestamp makes a repeated close attempt a no-op instead of creating duplicate return records.
async function resolveCaseCustody(client, {
  settlement, requestId, referenceNo, incidentType, reportedItems, resolution, userId,
}) {
  if (settlement.custody_resolved_at) {
    return {
      resolved: false,
      alreadyResolved: true,
      summary: settlement.custody_resolution_summary || 'Reported item custody was already resolved.',
    };
  }
  const inventory = await moveReportedItems(client, {
    requestId,
    referenceNo,
    incidentType,
    reportedItems,
    resolution,
    userId,
  });
  await client.query(
    `UPDATE loss_damage_settlements
        SET custody_resolved_at = NOW(),
            custody_resolved_by_user_id = $2,
            custody_resolution_summary = $3,
            updated_at = NOW()
      WHERE id = $1 AND custody_resolved_at IS NULL`,
    [settlement.id, userId, inventory.summary],
  );
  await addTimelineNote(client, requestId, `GSO resolved reported item custody. ${inventory.summary}`, userId);
  return { ...inventory, resolved: true, alreadyResolved: false };
}

// For repair (after the physical follow-up) or a historical resolved case -> Closed.
async function closeCase({ id, userId, note }) {
  return withTransaction(async (client) => {
    const { request, settlement } = await lockCase(client, id);
    if (request.status === 'Closed') throw httpError(409, 'This case is already closed.');
    if (request.status !== 'In Progress' || !settlement || !['FOR_REPAIR', 'RESOLVED'].includes(settlement.status)) {
      throw httpError(409, 'This case cannot be closed yet. Refresh the page.');
    }
    const inventory = await resolveCaseCustody(client, {
      settlement,
      requestId: id,
      referenceNo: request.reference_no,
      incidentType: request.form_data?.incidentType,
      reportedItems: Array.isArray(request.form_data?.items) ? request.form_data.items : [],
      resolution: settlement.resolution,
      userId,
    });
    await setRequestStatus(client, id, 'Closed');
    await addHistory(client, { id, previousStatus: request.status, status: 'Closed', note, userId });
    return { request: await requestsRepository.getById(client, id), inventory };
  });
}

// A resolved report removes the reported units from the requester's holdings in the same transaction.
//   Lost    -> the unit leaves stock as Unserviceable; its return is marked waived because this flow has no collection.
//   Damaged -> the unit is set aside in To Be Repaired as Unserviceable, where GSO repairs it or writes it off.
// The rules match the issuance returns workflow. An item that no longer matches its issuance is left as-is and
// named in the timeline for GSO to check.
async function moveReportedItems(client, { requestId, referenceNo, incidentType, reportedItems, resolution, userId }) {
  const lost = incidentType === 'LOST';
  const action = resolution === 'NO_CHARGE' ? 'no-charge decision' : 'for-repair closure';
  const reason = `Loss & Damage case ${referenceNo}: ${lost ? 'lost' : 'damaged'} item resolved by GSO (${action}).`;
  const moved = [];
  const skipped = [];
  for (const row of reportedItems) {
    const label = row.description || 'Item';
    if (!/^\d{1,20}$/.test(String(row.issuanceId ?? ''))) {
      skipped.push(`${label} (it has no issuance on record)`);
      continue;
    }
    const issuanceId = String(row.issuanceId);
    const tag = (await client.query(
      `SELECT tag.id, tag.tag_code, tag.item_id, tag.issuance_id, tag.label_version, tag.condition AS current_condition,
              tag.location, tag.custody_status, tag.lifecycle_status, tag.assigned_employee_id,
              item.item_code, item.description
         FROM asset_unit_tags AS tag
         JOIN item_catalog AS item ON item.id = tag.item_id
        WHERE tag.tag_code = $1 AND tag.issuance_id = $2
        FOR UPDATE OF tag`,
      [row.assetCode, issuanceId],
    )).rows[0];
    const result = tag
      ? await moveUnit(client, { tag, lost, reason, requestId, userId })
      : await moveQuantity(client, { issuanceId, quantity: Number(row.quantity), lost, reason, requestId, userId });
    if (result.text) moved.push(result.text);
    else skipped.push(`${label} (${result.why})`);
  }
  const parts = [];
  if (moved.length) parts.push(`Moved out of the requester's holdings: ${moved.join('; ')}.`);
  if (skipped.length) parts.push(`Not moved, GSO to check: ${skipped.join('; ')}.`);
  return { moved, skipped, summary: parts.join(' ') || 'No reported item needed to move.' };
}

async function moveUnit(client, { tag, lost, reason, requestId, userId }) {
  if (tag.custody_status !== 'Issued' || tag.lifecycle_status !== 'Active') return { why: 'no longer issued to the requester' };
  const issue = (await client.query(
    `SELECT id, employee_id, item_id, quantity, returned_quantity, status, unit_of_measure
       FROM employee_issuances WHERE id = $1 FOR UPDATE`,
    [tag.issuance_id],
  )).rows[0];
  if (!issue || issue.status !== 'Issued' || String(issue.employee_id) !== String(tag.assigned_employee_id)
    || Number(issue.quantity) - Number(issue.returned_quantity) < 1) {
    return { why: 'its issuance is no longer active' };
  }

  await expirePendingReturns(client, issue.id);
  await insertReturnRecord(client, {
    issuanceId: issue.id,
    tagId: tag.id,
    lost,
    quantity: 1,
    reason,
    snapshot: {
      tagCode: tag.tag_code,
      condition: tag.current_condition,
      location: tag.location,
      assignedEmployeeId: String(tag.assigned_employee_id),
      issuanceId: String(issue.id),
    },
  });
  await client.query(
    `UPDATE employee_issuances
        SET returned_quantity = returned_quantity + 1,
            status = CASE WHEN returned_quantity + 1 >= quantity THEN 'Returned' ELSE 'Issued' END
      WHERE id = $1`,
    [issue.id],
  );
  let newTagCode = tag.tag_code;
  if (lost) {
    await client.query(
      `UPDATE asset_unit_tags
          SET custody_status = 'Available', lifecycle_status = 'Disposed', condition = 'Unserviceable', disposal_reason = $2,
              assigned_employee_id = NULL, assigned_user_id = NULL, issuance_id = NULL, location = 'Lost',
              last_inspected_at = NOW(), last_inspection_note = $2, updated_at = NOW()
        WHERE id = $1`,
      [tag.id, reason],
    );
    await client.query('UPDATE item_catalog SET quantity = GREATEST(quantity - 1, 0) WHERE id = $1', [tag.item_id]);
  } else {
    await client.query(
      `UPDATE asset_unit_tags
          SET custody_status = 'Available', assigned_employee_id = NULL, assigned_user_id = NULL, issuance_id = NULL,
              condition = 'Unserviceable', location = 'To Be Repaired',
              last_inspected_at = NOW(), last_inspection_note = $2, updated_at = NOW()
        WHERE id = $1`,
      [tag.id, reason],
    );
    // A barcode lasts one issuance, as on every other return.
    newTagCode = (await retireUnitLabel(client, {
      tagId: tag.id, oldTagCode: tag.tag_code, labelVersion: tag.label_version, kind: 'return', reason, userId,
    })).newTagCode;
  }
  const inventoryStatus = await refreshInventoryStatus(client, tag.item_id);
  await auditRepository.writeLog(client, {
    entityType: 'item',
    entityKey: tag.item_code,
    entityName: tag.description,
    action: 'returned',
    reason,
    oldValues: { tagCode: tag.tag_code, custodyStatus: 'Issued', condition: tag.current_condition },
    newValues: {
      returnStatus: lost ? 'Lost' : 'Returned',
      tagCode: newTagCode,
      custodyStatus: 'Available',
      condition: 'Unserviceable',
      location: lost ? 'Lost' : 'To Be Repaired',
      inventoryStatus,
    },
    itemId: tag.item_id,
    employeeId: issue.employee_id,
    requestId,
    changedByUserId: userId,
    flag: lost ? 'ITEM_LOST' : null,
  });
  return { text: `${tag.description} (barcode ${tag.tag_code}) ${lost ? 'removed from stock as lost and marked Unserviceable' : 'set aside in To Be Repaired as Unserviceable'}` };
}

// Quantity-tracked stock keeps one shared condition, so damaged units are counted in repair_quantity and lost units leave the stock.
async function moveQuantity(client, { issuanceId, quantity, lost, reason, requestId, userId }) {
  const issue = (await client.query(
    `SELECT issue.id, issue.employee_id, issue.item_id, issue.quantity, issue.returned_quantity, issue.status,
            issue.unit_of_measure, item.item_code, item.description, item.tracking_mode
       FROM employee_issuances AS issue
       JOIN item_catalog AS item ON item.id = issue.item_id
      WHERE issue.id = $1
      FOR UPDATE OF issue`,
    [issuanceId],
  )).rows[0];
  if (!issue || issue.status !== 'Issued') return { why: 'its issuance is no longer active' };
  // A unit tracked by barcode is moved only by its barcode, so a plain quantity cannot stand in for it.
  if (issue.tracking_mode !== 'quantity') return { why: 'it does not match an issued unit' };
  if (!(quantity >= 1) || quantity > Number(issue.quantity) - Number(issue.returned_quantity)) {
    return { why: 'the requester no longer has that many' };
  }

  await expirePendingReturns(client, issue.id);
  await insertReturnRecord(client, { issuanceId: issue.id, tagId: null, lost, quantity, reason, snapshot: null });
  await client.query(
    `UPDATE employee_issuances
        SET returned_quantity = returned_quantity + $2,
            status = CASE WHEN returned_quantity + $2 >= quantity THEN 'Returned' ELSE 'Issued' END
      WHERE id = $1`,
    [issue.id, quantity],
  );
  if (lost) {
    await client.query(
      `UPDATE item_catalog
          SET quantity = GREATEST(quantity - $2, 0),
              condition = CASE WHEN quantity <= $2 THEN 'Unserviceable' ELSE condition END
        WHERE id = $1`,
      [issue.item_id, quantity],
    );
  } else {
    await client.query('UPDATE item_catalog SET repair_quantity = repair_quantity + $2 WHERE id = $1', [issue.item_id, quantity]);
  }
  const inventoryStatus = await refreshInventoryStatus(client, issue.item_id);
  await auditRepository.writeLog(client, {
    entityType: 'item',
    entityKey: issue.item_code,
    entityName: issue.description,
    action: 'returned',
    reason,
    oldValues: { issuanceStatus: 'Issued', returnedQuantity: Number(issue.returned_quantity) },
    newValues: { returnStatus: lost ? 'Lost' : 'Returned', quantity, condition: lost ? 'Lost' : 'Unserviceable', inventoryStatus },
    itemId: issue.item_id,
    employeeId: issue.employee_id,
    requestId,
    changedByUserId: userId,
    flag: lost ? 'ITEM_LOST' : null,
  });
  return { text: `${quantity} ${issue.unit_of_measure} of ${issue.description} ${lost ? 'removed from stock as lost' : 'set aside in To Be Repaired as Unserviceable'}` };
}

// A decided return row in the shape the returns module writes. Lost reports have no collection flow, so their
// settlement is recorded as waived; damaged items remain open in the repair queue.
async function insertReturnRecord(client, { issuanceId, tagId, lost, quantity, reason, snapshot }) {
  await client.query(
    `INSERT INTO employee_issuance_returns (
       issuance_id, asset_unit_tag_id, requested_by_user_id, status, token_hash, token_expires_at,
       return_condition, reason, decision_note, decided_at, quantity, tag_snapshot,
       settlement_status, settlement_note, settled_at
     ) VALUES ($1, $2, NULL, $3, $4, NOW(), $5, $6, $7, NOW(), $8, $9::JSONB, $10, $11, $12)`,
    [
      issuanceId, tagId, lost ? 'Lost' : 'Returned', crypto.randomBytes(32).toString('hex'),
      lost ? 'Lost' : 'Unserviceable', reason,
      'Recorded when GSO resolved this Loss & Damage case.', quantity,
      snapshot ? JSON.stringify(snapshot) : null,
      lost ? 'Waived' : null,
      lost ? 'Resolved through a GSO Loss & Damage decision.' : null,
      lost ? new Date() : null,
    ],
  );
}

// An emailed return request for the same issuance no longer applies once the item has left the requester's holdings.
async function expirePendingReturns(client, issuanceId) {
  await client.query(
    `UPDATE employee_issuance_returns
        SET status = 'Expired', decision_note = 'Superseded by a GSO Loss & Damage resolution.', decided_at = NOW()
      WHERE issuance_id = $1 AND status = 'Pending'`,
    [issuanceId],
  );
}

module.exports = {
  listSettlements,
  getSettlement,
  startReview,
  saveDecision,
  closeCase,
};
