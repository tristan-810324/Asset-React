const pool = require('../../config/db');
const { createAssetTagCode } = require('./issuances.repository');

// Current labels are printable. Returned labels remain in the list as read-only history.
async function listUnitLabels({ limit = 2000 } = {}) {
  const [issuedResult, returnedResult] = await Promise.all([
    pool.query(
      `SELECT tag.tag_code AS "tagCode",
              tag.label_version AS "labelVersion",
              tag.unit_number AS "unitNumber",
              item.item_code AS "itemCode",
              COALESCE(NULLIF(item.item_name, ''), item.description) AS "itemName",
              employee.employee_code AS "holderCode",
              employee.first_name || ' ' || employee.last_name AS "holderName",
              batch_employee.first_name || ' ' || batch_employee.last_name AS "batchEmployeeName",
              batch_employee.email AS "batchEmployeeEmail",
              batch.email_sent_at IS NOT NULL AS "emailSent",
              COALESCE(issue.decided_at, issue.requested_at) AS "issuedAt",
              issue.batch_id::TEXT AS "batchId",
              requisition.reference_no AS "purchaseRequisitionReference",
              tag.label_printed_at AS "labelPrintedAt",
              label_printer.name AS "labelPrintedBy",
              current_reprint.created_at AS "reprintedAt",
              current_reprint.reason AS "reprintReason",
              FALSE AS "isReturned",
              NULL::TIMESTAMPTZ AS "returnedAt",
              NULL::TEXT AS "returnCondition",
              NULL::TEXT AS "returnReason",
              NULL::TEXT AS "returnedByName",
              NULL::TEXT AS "processedBy"
         FROM asset_unit_tags AS tag
         JOIN item_catalog AS item ON item.id = tag.item_id
         JOIN employees AS employee ON employee.id = tag.assigned_employee_id
         LEFT JOIN employee_issuances AS issue ON issue.id = tag.issuance_id
         LEFT JOIN employee_issuance_batches AS batch ON batch.id = issue.batch_id
         LEFT JOIN employees AS batch_employee ON batch_employee.id = batch.employee_id
         LEFT JOIN service_requests AS requisition ON requisition.id = batch.purchase_requisition_id
         -- Set only when the current barcode itself came from a reprint.
         LEFT JOIN asset_label_reprints AS current_reprint
           ON current_reprint.asset_unit_tag_id = tag.id AND current_reprint.new_tag_code = tag.tag_code AND current_reprint.kind = 'reprint'
         LEFT JOIN users AS label_printer ON label_printer.id = tag.label_printed_by_user_id
        WHERE tag.custody_status = 'Issued' AND tag.lifecycle_status <> 'Disposed'
        ORDER BY (tag.label_printed_at IS NULL) DESC, COALESCE(issue.decided_at, issue.requested_at) DESC NULLS LAST, item.item_code, tag.unit_number
        LIMIT $1`,
      [limit],
    ),
    pool.query(
      `SELECT reprint.old_tag_code AS "tagCode",
              GREATEST(reprint.label_version - 1, 1)::INTEGER AS "labelVersion",
              tag.unit_number AS "unitNumber",
              item.item_code AS "itemCode",
              COALESCE(NULLIF(item.item_name, ''), item.description) AS "itemName",
              employee.employee_code AS "holderCode",
              employee.first_name || ' ' || employee.last_name AS "holderName",
              batch_employee.first_name || ' ' || batch_employee.last_name AS "batchEmployeeName",
              batch_employee.email AS "batchEmployeeEmail",
              batch.email_sent_at IS NOT NULL AS "emailSent",
              COALESCE(issue.decided_at, issue.requested_at) AS "issuedAt",
              issue.batch_id::TEXT AS "batchId",
              requisition.reference_no AS "purchaseRequisitionReference",
              NULL::TIMESTAMPTZ AS "labelPrintedAt",
              NULL::TEXT AS "labelPrintedBy",
              NULL::TIMESTAMPTZ AS "reprintedAt",
              NULL::TEXT AS "reprintReason",
              TRUE AS "isReturned",
              COALESCE(return_record.decided_at, return_record.requested_at) AS "returnedAt",
              return_record.return_condition AS "returnCondition",
              return_record.reason AS "returnReason",
              return_record.returned_by_name AS "returnedByName",
              processor.name AS "processedBy"
         FROM asset_label_reprints AS reprint
         JOIN asset_unit_tags AS tag ON tag.id = reprint.asset_unit_tag_id
         JOIN item_catalog AS item ON item.id = tag.item_id
         JOIN employee_issuance_returns AS return_record
           ON return_record.asset_unit_tag_id = tag.id
          AND return_record.status = 'Returned'
          AND return_record.tag_snapshot->>'tagCode' = reprint.old_tag_code
         JOIN employee_issuances AS issue ON issue.id = return_record.issuance_id
         JOIN employees AS employee ON employee.id = issue.employee_id
         LEFT JOIN employee_issuance_batches AS batch ON batch.id = issue.batch_id
         LEFT JOIN employees AS batch_employee ON batch_employee.id = batch.employee_id
         LEFT JOIN service_requests AS requisition ON requisition.id = batch.purchase_requisition_id
         LEFT JOIN users AS processor ON processor.id = return_record.requested_by_user_id
        WHERE reprint.kind = 'return'
        ORDER BY COALESCE(return_record.decided_at, return_record.requested_at) DESC, item.item_code, tag.unit_number
        LIMIT $1`,
      [limit],
    ),
  ]);
  return [...issuedResult.rows, ...returnedResult.rows];
}

async function lockCurrentLabel(client, tagCode) {
  const found = await client.query(
    `SELECT tag.id, tag.tag_code, tag.label_version, tag.unit_number, tag.lifecycle_status, tag.custody_status,
            tag.label_printed_at, printer.name AS label_printed_by,
            tag.assigned_employee_id, item.id AS item_id, item.item_code,
            COALESCE(NULLIF(item.item_name, ''), item.description) AS item_name, item.description
       FROM asset_unit_tags AS tag
       JOIN item_catalog AS item ON item.id = tag.item_id
       LEFT JOIN users AS printer ON printer.id = tag.label_printed_by_user_id
      WHERE tag.tag_code = $1
      FOR UPDATE OF tag`,
    [tagCode],
  );
  const tag = found.rows[0];
  if (!tag) {
    const retired = await client.query('SELECT kind FROM asset_label_reprints WHERE old_tag_code = $1', [tagCode]);
    const kind = retired.rows[0]?.kind;
    throw Object.assign(new Error(!kind
      ? 'Walang unit na may ganitong barcode.'
      : kind === 'return'
        ? 'Hindi na gumagana ang label na ito dahil naibalik na ang unit. Bagong label ang ipi-print kapag na-issue ulit ito.'
        : 'Luma na ang label na ito; may mas bagong label na ang unit. Hanapin ang unit sa listahan para i-print ang kasalukuyang label.'), { status: kind ? 409 : 404 });
  }
  if (tag.lifecycle_status === 'Disposed') {
    throw Object.assign(new Error('Lost o written off na ang unit na ito, kaya hindi na ito puwedeng bigyan ng label.'), { status: 409 });
  }
  if (tag.custody_status !== 'Issued') {
    throw Object.assign(new Error('Nasa GSO ang unit na ito, kaya walang label na ipi-print. Bagong label ang ipi-print kapag na-issue ulit ito.'), { status: 409 });
  }
  return tag;
}

// Gives the unit a new barcode and records the old one as retired, so the old label stops scanning.
// The new barcode starts unprinted; it uses its one free print when GSO prints it.
async function retireUnitLabel(client, { tagId, oldTagCode, labelVersion, kind, reason, userId }) {
  let newTagCode = null;
  for (let attempt = 0; attempt < 5 && !newTagCode; attempt += 1) {
    const candidate = createAssetTagCode();
    const taken = await client.query(
      `SELECT 1 FROM asset_unit_tags WHERE tag_code = $1
        UNION ALL SELECT 1 FROM asset_label_reprints WHERE old_tag_code = $1`,
      [candidate],
    );
    if (!taken.rowCount) newTagCode = candidate;
  }
  if (!newTagCode) throw Object.assign(new Error('Hindi makagawa ng bagong barcode. Subukan ulit.'), { status: 503 });

  const nextVersion = Number(labelVersion) + 1;
  await client.query(
    `UPDATE asset_unit_tags
        SET tag_code = $2, label_version = $3, label_printed_at = NULL, label_printed_by_user_id = NULL, updated_at = NOW()
      WHERE id = $1`,
    [tagId, newTagCode, nextVersion],
  );
  const retired = await client.query(
    `INSERT INTO asset_label_reprints (asset_unit_tag_id, old_tag_code, new_tag_code, label_version, reason, printed_by_user_id, kind)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING created_at AS "retiredAt"`,
    [tagId, oldTagCode, newTagCode, nextVersion, reason, userId, kind],
  );
  // A return code emailed for the old label must not complete a return any more.
  await client.query('UPDATE asset_return_otps SET used_at = NOW() WHERE asset_unit_tag_id = $1 AND used_at IS NULL', [tagId]);
  return { newTagCode, labelVersion: nextVersion, retiredAt: retired.rows[0].retiredAt };
}

async function writeLabelLog(client, tag, { reason, oldValues, newValues, userId }) {
  await client.query(
    `INSERT INTO inventory_change_logs (
       entity_type, entity_key, entity_name, item_id, employee_id, action, reason,
       old_values, new_values, changed_by_user_id, flag
     ) VALUES ('item', $1, $2, $3, $4, 'updated', $5, $6::JSONB, $7::JSONB, $8, $9)`,
    // A reprint retires the old barcode, so reviewers should see it.
    [tag.item_code, tag.description, tag.item_id, tag.assigned_employee_id, reason, JSON.stringify(oldValues), JSON.stringify(newValues), userId,
      oldValues?.tagCode ? 'LABEL_REPRINT' : null],
  );
}

async function inTransaction(work) {
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

// The one free print of the current barcode; printing it again needs a reprint with a new barcode.
async function recordLabelPrint({ tagCode, userId }) {
  const [label] = await recordLabelPrintBatch({ tagCodes: [tagCode], userId });
  return label;
}

// A requisition becomes Issued only when every one of its unit labels has been printed, since printing happens at handover.
async function markRequisitionIssuedIfLabelsPrinted(client, tagIds, userId) {
  const requisitions = await client.query(
    `SELECT DISTINCT batch.purchase_requisition_id AS id
       FROM asset_unit_tags AS tag
       JOIN employee_issuances AS issue ON issue.id = tag.issuance_id
       JOIN employee_issuance_batches AS batch ON batch.id = issue.batch_id
      WHERE tag.id = ANY($1::bigint[]) AND batch.purchase_requisition_id IS NOT NULL`,
    [tagIds],
  );
  for (const { id } of requisitions.rows) {
    const left = await client.query(
      `SELECT COUNT(*)::INTEGER AS left
         FROM asset_unit_tags AS tag
         JOIN employee_issuances AS issue ON issue.id = tag.issuance_id
         JOIN employee_issuance_batches AS batch ON batch.id = issue.batch_id
        WHERE batch.purchase_requisition_id = $1 AND tag.label_printed_at IS NULL`,
      [id],
    );
    if (left.rows[0].left > 0) continue;
    const updated = await client.query(
      `UPDATE service_requests SET status = 'Issued', updated_at = NOW()
        WHERE id = $1 AND status = 'Approved' RETURNING status`,
      [id],
    );
    if (updated.rowCount) {
      await client.query(
        `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
         VALUES ($1, 'Approved', 'Issued', 'All barcode labels are printed; the items were issued to the recipients.', $2)`,
        [id, userId],
      );
    }
  }
}

// Marks an entire issuance's labels in one transaction, so a failed group print does not consume only some labels.
async function recordLabelPrintBatch({ tagCodes, userId }) {
  return inTransaction(async (client) => {
    const tagsByCode = new Map();
    // Use a stable lock order to avoid deadlocks when two staff members print overlapping groups.
    for (const tagCode of [...tagCodes].sort()) {
      const tag = await lockCurrentLabel(client, tagCode);
      if (tag.label_printed_at) {
        const printedOn = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(tag.label_printed_at));
        throw Object.assign(new Error(`Na-print na ang label na ito noong ${printedOn}${tag.label_printed_by ? ` ni ${tag.label_printed_by}` : ''}. Kung kailangan ng bago, gamitin ang Reprint label.`), { status: 409 });
      }
      tagsByCode.set(tagCode, tag);
    }

    const labels = [];
    for (const tagCode of tagCodes) {
      const tag = tagsByCode.get(tagCode);
      const printed = await client.query(
        'UPDATE asset_unit_tags SET label_printed_at = NOW(), label_printed_by_user_id = $2 WHERE id = $1 RETURNING label_printed_at AS "printedAt"',
        [tag.id, userId],
      );
      await writeLabelLog(client, tag, {
        reason: `Label #${tag.label_version} for unit ${tag.unit_number} printed (barcode ${tag.tag_code}).`,
        oldValues: { labelPrinted: false },
        newValues: { labelPrinted: true, tagCode: tag.tag_code, labelVersion: Number(tag.label_version) },
        userId,
      });
      labels.push({ tagCode: tag.tag_code, printedAt: printed.rows[0].printedAt });
    }
    await markRequisitionIssuedIfLabelsPrinted(client, [...tagsByCode.values()].map((tag) => tag.id), userId);
    return labels;
  });
}

// Gives the unit a new barcode and retires the old one, so only the newest label scans.
async function reprintUnitLabel({ tagCode, reason, userId }) {
  return inTransaction(async (client) => {
    const tag = await lockCurrentLabel(client, tagCode);

    const { newTagCode, labelVersion, retiredAt } = await retireUnitLabel(client, {
      tagId: tag.id, oldTagCode: tag.tag_code, labelVersion: tag.label_version, kind: 'reprint', reason, userId,
    });
    await writeLabelLog(client, tag, {
      reason: `Label for unit ${tag.unit_number} reprinted as label #${labelVersion}; old barcode ${tag.tag_code} retired. Reason: ${reason}`,
      oldValues: { tagCode: tag.tag_code, labelVersion: Number(tag.label_version) },
      newValues: { tagCode: newTagCode, labelVersion },
      userId,
    });
    return {
      tagCode: newTagCode,
      oldTagCode: tag.tag_code,
      labelVersion,
      reprintedAt: retiredAt,
      unitNumber: tag.unit_number,
      itemCode: tag.item_code,
      itemName: tag.item_name,
    };
  });
}

module.exports = { listUnitLabels, recordLabelPrint, recordLabelPrintBatch, reprintUnitLabel, retireUnitLabel };
