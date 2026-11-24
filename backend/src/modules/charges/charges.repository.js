const pool = require('../../config/db');

const httpError = (status, message) => Object.assign(new Error(message), { status });

// Every charged item, from the three places a charge can come from:
// a facility item written off, a returned unit written off, or a Loss & Damage case charged.
const CHARGES_CTE = `
  WITH charges AS (
    SELECT 'FACILITY'::TEXT AS kind, asset.id::TEXT AS ref,
           request.reference_no::TEXT AS "referenceNo",
           COALESCE(NULLIF(item.item_name, ''), item.description, request.title)::TEXT AS "itemName",
           requester.name::TEXT AS "personName",
           asset.write_off_estimated_value AS amount,
           asset.write_off_at AS "chargedAt",
           asset.settlement_status::TEXT AS "settlementStatus"
      FROM service_request_assets AS asset
      JOIN service_requests AS request ON request.id = asset.request_id
      LEFT JOIN item_catalog AS item ON item.id = asset.item_id
      LEFT JOIN users AS requester ON requester.id = request.requested_by_user_id
     WHERE asset.write_off_decision = 'CHARGED'
    UNION ALL
    SELECT 'RETURN'::TEXT AS kind, ret.id::TEXT AS ref,
           item.item_code::TEXT AS "referenceNo",
           COALESCE(NULLIF(item.item_name, ''), item.description)::TEXT AS "itemName",
           (employee.first_name || ' ' || employee.last_name)::TEXT AS "personName",
           ret.write_off_estimated_value AS amount,
           ret.write_off_at AS "chargedAt",
           ret.settlement_status::TEXT AS "settlementStatus"
      FROM employee_issuance_returns AS ret
      JOIN employee_issuances AS issuance ON issuance.id = ret.issuance_id
      JOIN employees AS employee ON employee.id = issuance.employee_id
      JOIN item_catalog AS item ON item.id = issuance.item_id
     WHERE ret.write_off_decision = 'CHARGED'
    UNION ALL
    SELECT 'LOSS'::TEXT AS kind, settlement.id::TEXT AS ref,
           request.reference_no::TEXT AS "referenceNo",
           request.title::TEXT AS "itemName",
           requester.name::TEXT AS "personName",
           settlement.charge_amount AS amount,
           settlement.assessed_at AS "chargedAt",
           settlement.status::TEXT AS "settlementStatus"
      FROM loss_damage_settlements AS settlement
      JOIN service_requests AS request ON request.id = settlement.request_id
      LEFT JOIN users AS requester ON requester.id = request.requested_by_user_id
     WHERE settlement.resolution = 'CHARGED'
  )`;

const CHARGE_COLUMNS = `
  charge.kind, charge.ref, charge."referenceNo", charge."itemName", charge."personName",
  charge.amount, charge."chargedAt", charge."settlementStatus",
  receipt.receipt_name AS "receiptName", receipt.note AS "receiptNote", receipt.uploaded_at AS "uploadedAt",
  uploader.name AS "uploadedBy", (receipt.id IS NOT NULL) AS paid`;

async function listCharges() {
  const result = await pool.query(
    `${CHARGES_CTE}
     SELECT ${CHARGE_COLUMNS}
       FROM charges AS charge
       LEFT JOIN charge_receipts AS receipt ON receipt.source_kind = charge.kind AND receipt.source_ref = charge.ref
       LEFT JOIN users AS uploader ON uploader.id = receipt.uploaded_by_user_id
      ORDER BY paid ASC, charge."chargedAt" DESC NULLS LAST`,
  );
  return result.rows;
}

async function findCharge(queryable, kind, ref) {
  const result = await queryable.query(
    `${CHARGES_CTE}
     SELECT ${CHARGE_COLUMNS}
       FROM charges AS charge
       LEFT JOIN charge_receipts AS receipt ON receipt.source_kind = charge.kind AND receipt.source_ref = charge.ref
       LEFT JOIN users AS uploader ON uploader.id = receipt.uploaded_by_user_id
      WHERE charge.kind = $1 AND charge.ref = $2`,
    [kind, ref],
  );
  return result.rows[0] || null;
}

async function getReceipt(kind, ref) {
  const result = await pool.query(
    `SELECT receipt.receipt_data AS "receiptData", receipt.receipt_name AS "receiptName", receipt.note,
            receipt.uploaded_at AS "uploadedAt", uploader.name AS "uploadedBy"
       FROM charge_receipts AS receipt
       LEFT JOIN users AS uploader ON uploader.id = receipt.uploaded_by_user_id
      WHERE receipt.source_kind = $1 AND receipt.source_ref = $2`,
    [kind, ref],
  );
  return result.rows[0] || null;
}

// Stores the receipt and marks the charge Paid in its own record, in one transaction.
async function payCharge({ kind, ref, receiptData, receiptName, note, userId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const charge = await findCharge(client, kind, ref);
    if (!charge) throw httpError(404, 'Charge not found.');
    if (charge.paid) throw httpError(409, 'This charge is already paid.');

    await client.query(
      `INSERT INTO charge_receipts (source_kind, source_ref, receipt_data, receipt_name, note, uploaded_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [kind, ref, receiptData, receiptName, note, userId],
    );
    if (kind === 'FACILITY') {
      await client.query(
        `UPDATE service_request_assets SET settlement_status = 'Paid', settled_at = NOW(), settled_by_user_id = $2 WHERE id = $1`,
        [ref, userId],
      );
    } else if (kind === 'RETURN') {
      await client.query(
        `UPDATE employee_issuance_returns SET settlement_status = 'Paid', settled_at = NOW(), settled_by_user_id = $2 WHERE id = $1`,
        [ref, userId],
      );
    } else {
      await client.query(
        `UPDATE loss_damage_settlements SET resolution = 'RESOLVED', status = 'RESOLVED', updated_at = NOW() WHERE id = $1 AND resolution = 'CHARGED'`,
        [ref],
      );
    }
    await client.query('COMMIT');
    return charge;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { listCharges, findCharge, getReceipt, payCharge };
