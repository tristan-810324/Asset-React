// Loss & Damage Cases storage. The report is a service_requests row (LOSS_DAMAGE_REPORT); its decision and payment
// live in loss_damage_settlements (migration 008). Every change locks the request first, then the settlement.
const crypto = require('node:crypto');
const pool = require('../../config/db');
const requestsRepository = require('../requests/requests.repository');
const facilityDamageRepository = require('../requests/facility-damage-payments.repository');
const auditRepository = require('../audit/audit.repository');
const { refreshInventoryStatus } = require('../inventory/inventory.stock');
const { retireUnitLabel } = require('../issuances/labels.repository');

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

// Checkout Sessions (cs_...) send checkout_session.payment.paid; older Payment Links (link_...) send link.payment.paid.
const SUPPORTED_EVENTS = ['link.payment.paid', 'checkout_session.payment.paid'];

const SETTLEMENT_SELECT = `
  SELECT settlement.id::TEXT AS id,
         settlement.request_id::TEXT AS "requestId",
         settlement.resolution,
         settlement.reason,
         settlement.amount_centavos AS "amountCentavos",
         settlement.currency,
         settlement.status,
         settlement.assessed_at AS "assessedAt",
         (SELECT assessor.name FROM users AS assessor WHERE assessor.id = settlement.assessed_by_user_id) AS "assessedBy",
         settlement.paymongo_link_id AS "linkId",
         settlement.paymongo_checkout_url AS "checkoutUrl",
         settlement.paymongo_reference_number AS "linkReference",
         settlement.link_created_at AS "linkCreatedAt",
         (SELECT creator.name FROM users AS creator WHERE creator.id = settlement.link_created_by_user_id) AS "linkCreatedBy",
         COALESCE(cardinality(settlement.previous_link_ids), 0) AS "cancelledLinkCount",
         settlement.paymongo_payment_id AS "paymentId",
         settlement.paid_at AS "paidAt",
         settlement.updated_at AS "updatedAt",
         settlement.facility_asset_ids AS "facilityAssetIds",
         -- The latest PayMongo report that was logged but not applied, so GSO can check the PayMongo dashboard.
         (SELECT json_build_object('outcome', event.outcome, 'receivedAt', event.received_at)
            FROM paymongo_webhook_events AS event
           WHERE event.settlement_id = settlement.id AND event.outcome LIKE 'REJECTED_%'
           ORDER BY event.received_at DESC, event.id DESC
           LIMIT 1) AS "paymentWarning"
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
    'SELECT id, request_type, status, form_data FROM service_requests WHERE id = $1 FOR UPDATE',
    [id],
  )).rows[0];
  if (!request || request.request_type !== 'LOSS_DAMAGE_REPORT') throw httpError(404, 'Loss / damage case not found.');
  const settlement = (await client.query(
    'SELECT id, status, resolution, amount_centavos FROM loss_damage_settlements WHERE request_id = $1 FOR UPDATE',
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

// A note on the request timeline without a status change, such as a payment link or a PayMongo confirmation.
async function addTimelineNote(client, id, note, userId) {
  const { status } = (await client.query('UPDATE service_requests SET updated_at = NOW() WHERE id = $1 RETURNING status', [id])).rows[0];
  await addHistory(client, { id, previousStatus: status, status, note, userId });
}

// Submitted (or a report sent back to the requester) → Under Review.
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

// Reports decided before this page existed can still be Approved or In Progress without a settlement.
const DECIDABLE_STATUSES = ['Under Review', 'Approved', 'In Progress'];

// Saves the decision. No charge closes the case; For repair and Payment required keep it In Progress.
// While nothing is waiting on PayMongo, the decision can still change (For repair, or Payment required before its link).
async function saveDecision({ id, userId, resolution, reason, amountCentavos, summary, resolvedUnits }) {
  return withTransaction(async (client) => {
    const { request, settlement } = await lockCase(client, id);
    if (!settlement && !DECIDABLE_STATUSES.includes(request.status)) {
      throw httpError(409, ['Submitted', 'Needs Information'].includes(request.status)
        ? 'Start the review before you decide.'
        : `This case is ${request.status.toLowerCase()} and cannot be decided.`);
    }
    if (settlement && !(request.status === 'In Progress' && ['FOR_REPAIR', 'PENDING_LINK'].includes(settlement.status))) {
      throw httpError(409, settlement.status === 'AWAITING_PAYMENT'
        ? 'Cancel the payment link before you change the decision.'
        : 'This decision can no longer be changed.');
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
    const status = resolution === 'PAYMENT_REQUIRED' ? 'PENDING_LINK' : resolution;
    await client.query(
      `INSERT INTO loss_damage_settlements (request_id, resolution, reason, amount_centavos, status, assessed_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (request_id) DO UPDATE SET
         resolution = EXCLUDED.resolution,
         reason = EXCLUDED.reason,
         amount_centavos = EXCLUDED.amount_centavos,
         status = EXCLUDED.status,
         assessed_by_user_id = EXCLUDED.assessed_by_user_id,
         assessed_at = NOW(),
         updated_at = NOW()`,
      [id, resolution, reason, amountCentavos, status, userId],
    );
    const requestStatus = resolution === 'NO_CHARGE' ? 'Closed' : 'In Progress';
    await setRequestStatus(client, id, requestStatus);
    await addHistory(client, {
      id,
      previousStatus: request.status,
      status: requestStatus,
      note: `${changed ? 'Decision changed' : 'Decision'}: ${summary}. Reason: ${reason}`,
      userId,
    });
    return { request: await requestsRepository.getById(client, id), changed };
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

// Stores a new PayMongo link, only if the case still waits for one at the same amount.
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
        WHERE request_id = $1 AND status = 'PENDING_LINK' AND amount_centavos = $2
        RETURNING id`,
      [requestId, amountCentavos, link.id, link.checkoutUrl, link.referenceNumber, userId],
    );
    if (!result.rowCount) return false;
    await addTimelineNote(client, requestId, note, userId);
    return true;
  });
}

// The cancelled link is kept in previous_link_ids, so a late payment on it is logged and never applied.
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
        WHERE request_id = $1 AND status = 'AWAITING_PAYMENT' AND paymongo_link_id = $2
        RETURNING id`,
      [requestId, linkId],
    );
    if (!result.rowCount) return false;
    await addTimelineNote(client, requestId, note, userId);
    return true;
  });
}

// For repair (after the repair) or a confirmed payment (after any follow-up) → Closed.
async function closeCase({ id, userId, note }) {
  return withTransaction(async (client) => {
    const { request, settlement } = await lockCase(client, id);
    if (request.status === 'Closed') throw httpError(409, 'This case is already closed.');
    if (request.status !== 'In Progress' || !settlement || !['FOR_REPAIR', 'PAID'].includes(settlement.status)) {
      throw httpError(409, ['PENDING_LINK', 'AWAITING_PAYMENT'].includes(settlement?.status)
        ? 'Wait until PayMongo confirms the payment before you close this case.'
        : 'This case cannot be closed yet. Refresh the page.');
    }
    await setRequestStatus(client, id, 'Closed');
    await addHistory(client, { id, previousStatus: request.status, status: 'Closed', note, userId });
    return { request: await requestsRepository.getById(client, id), settlementStatus: settlement.status };
  });
}

// Once PayMongo confirms the payment, the reported items leave the requester's holdings in the same transaction.
//   Lost    → the unit leaves stock as Unserviceable; its return is recorded as Lost and settled as Paid.
//   Damaged → the unit is set aside in To Be Repaired as Unserviceable, where GSO repairs it or writes it off.
// The rules match the issuance returns (returns.repository.js); the payment replaces the emailed return code.
// An item that no longer matches its issuance is left as it is and named in the timeline for GSO to check.
async function moveReportedItems(client, { requestId, referenceNo, incidentType, reportedItems, paymentId }) {
  const lost = incidentType === 'LOST';
  const reason = `Loss & Damage case ${referenceNo}: ${lost ? 'lost' : 'damaged'} item, paid through PayMongo${paymentId ? ` (${paymentId})` : ''}.`;
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
      ? await moveUnit(client, { tag, lost, reason, requestId })
      : await moveQuantity(client, { issuanceId, quantity: Number(row.quantity), lost, reason, requestId });
    if (result.text) moved.push(result.text);
    else skipped.push(`${label} (${result.why})`);
  }
  const parts = [];
  if (moved.length) parts.push(`Moved out of the requester's holdings: ${moved.join('; ')}.`);
  if (skipped.length) parts.push(`Not moved, GSO to check: ${skipped.join('; ')}.`);
  return { moved, skipped, summary: parts.join(' ') || 'No reported item needed to move.' };
}

async function moveUnit(client, { tag, lost, reason, requestId }) {
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
      tagId: tag.id, oldTagCode: tag.tag_code, labelVersion: tag.label_version, kind: 'return', reason, userId: null,
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
    flag: lost ? 'ITEM_LOST' : null,
  });
  return { text: `${tag.description} (barcode ${tag.tag_code}) ${lost ? 'removed from stock as lost and marked Unserviceable' : 'set aside in To Be Repaired as Unserviceable'}` };
}

// Quantity-tracked stock keeps one shared condition, so damaged units are counted in repair_quantity and lost units leave the stock.
async function moveQuantity(client, { issuanceId, quantity, lost, reason, requestId }) {
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
    flag: lost ? 'ITEM_LOST' : null,
  });
  return { text: `${quantity} ${issue.unit_of_measure} of ${issue.description} ${lost ? 'removed from stock as lost' : 'set aside in To Be Repaired as Unserviceable'}` };
}

// A decided return row in the shape the returns module writes. The payment replaces the emailed code, so its token is random and never used.
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
      'Recorded when PayMongo confirmed a Loss & Damage payment.', quantity,
      snapshot ? JSON.stringify(snapshot) : null,
      lost ? 'Paid' : null, lost ? 'Paid through a Loss & Damage case.' : null, lost ? new Date() : null,
    ],
  );
}

// An emailed return request for the same issuance no longer applies once the item has left the requester's holdings.
async function expirePendingReturns(client, issuanceId) {
  await client.query(
    `UPDATE employee_issuance_returns
        SET status = 'Expired', decision_note = 'Superseded by a paid Loss & Damage case.', decided_at = NOW()
      WHERE issuance_id = $1 AND status = 'Pending'`,
    [issuanceId],
  );
}

// Applies one verified PayMongo event at most once. A repeated event id changes nothing.
// Anything that does not match the case exactly is logged with its outcome and never marks a case paid.
async function processWebhookEvent(event) {
  try {
    return await withTransaction(async (client) => {
      const seen = await client.query('SELECT 1 FROM paymongo_webhook_events WHERE provider_event_id = $1', [event.eventId]);
      if (seen.rowCount) return { outcome: 'DUPLICATE' };

      let outcome = 'PROCESSED';
      let settlement = null;
      let alreadyPaid = false;
      let inventory = { moved: [], skipped: [], summary: '' };
      if (!SUPPORTED_EVENTS.includes(event.eventType)) outcome = 'IGNORED_TYPE';
      else if (event.livemode !== false) outcome = 'REJECTED_LIVE';
      else {
        // A PayMongo link id belongs to one case: either its current link or a cancelled one.
        settlement = event.linkId ? (await client.query(
          `SELECT id, request_id, status, amount_centavos, paymongo_link_id, facility_asset_ids
             FROM loss_damage_settlements
            WHERE paymongo_link_id = $1 OR $1 = ANY (previous_link_ids)
            LIMIT 1
            FOR UPDATE`,
          [event.linkId],
        )).rows[0] || null : null;
        if (!settlement) outcome = 'REJECTED_LINK';
        else if (settlement.paymongo_link_id !== event.linkId || settlement.status !== 'AWAITING_PAYMENT') {
          alreadyPaid = settlement.paymongo_link_id === event.linkId && settlement.status === 'PAID';
          outcome = 'REJECTED_STATE';
        }
        else if ((event.paymentCurrency || event.currency) !== 'PHP') outcome = 'REJECTED_CURRENCY';
        // The paid amount must be present and equal to the case amount. A link event also states its amount, which must match too.
        else if (event.paymentAmount !== settlement.amount_centavos
          || (event.linkAmount !== null && event.linkAmount !== settlement.amount_centavos)) outcome = 'REJECTED_AMOUNT';
      }

      if (outcome === 'PROCESSED') {
        await client.query(
          `UPDATE loss_damage_settlements
              SET status = 'PAID', paymongo_payment_id = $2, paid_at = COALESCE($3, NOW()), updated_at = NOW()
            WHERE id = $1 AND status = 'AWAITING_PAYMENT'`,
          [settlement.id, event.paymentId, event.paidAt],
        );
        const report = (await client.query('SELECT reference_no, request_type, form_data FROM service_requests WHERE id = $1', [settlement.request_id])).rows[0];
        if (report?.request_type === 'FACILITY_USE' && settlement.facility_asset_ids) {
          inventory = await facilityDamageRepository.applyPayment(client, {
            settlement,
            paymentId: event.paymentId,
            paidAt: event.paidAt,
          });
        } else {
          await addTimelineNote(client, settlement.request_id,
            `PayMongo confirmed the test payment${event.paymentId ? ` (${event.paymentId})` : ''}.`, null);
          inventory = await moveReportedItems(client, {
            requestId: settlement.request_id,
            referenceNo: report.reference_no,
            incidentType: report.form_data?.incidentType,
            reportedItems: Array.isArray(report.form_data?.items) ? report.form_data.items : [],
            paymentId: event.paymentId,
          });
          await addTimelineNote(client, settlement.request_id, inventory.summary, null);
        }
      }

      const inserted = await client.query(
        `INSERT INTO paymongo_webhook_events (
           provider_event_id, event_type, livemode, settlement_id, paymongo_link_id, payload_sha256, outcome, received_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (provider_event_id) DO NOTHING
         RETURNING id`,
        [event.eventId, event.eventType || 'unknown', event.livemode, settlement?.id || null, event.linkId || null,
          event.payloadSha256, outcome, event.receivedAt],
      );
      // Another delivery of the same event finished first: undo this one.
      if (!inserted.rowCount) throw Object.assign(new Error('Duplicate PayMongo event.'), { duplicateEvent: true });
      return {
        outcome,
        requestId: settlement ? String(settlement.request_id) : null,
        amountCentavos: settlement ? settlement.amount_centavos : null,
        paymentId: event.paymentId,
        alreadyPaid,
        inventory,
      };
    });
  } catch (error) {
    if (error.duplicateEvent) return { outcome: 'DUPLICATE' };
    throw error;
  }
}

module.exports = {
  listSettlements,
  getSettlement,
  startReview,
  saveDecision,
  attachLink,
  clearLink,
  closeCase,
  processWebhookEvent,
};
