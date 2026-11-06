const crypto = require('node:crypto');
const pool = require('../../config/db');
const { refreshInventoryStatus } = require('../inventory/inventory.stock');
const { retireUnitLabel } = require('./labels.repository');

function notFound(message) {
  return Object.assign(new Error(message), { status: 404 });
}

function conflict(message) {
  return Object.assign(new Error(message), { status: 409 });
}

const repairReturnConditions = ['Needs Repair', 'Under Maintenance', 'Unserviceable'];

async function writeReturnAuditLog(client, record, {
  changedByUserId = null,
  reason,
  oldValues,
  newValues,
}) {
  await client.query(
    `INSERT INTO inventory_change_logs (
       entity_type, entity_key, entity_name, item_id, employee_id, action, reason,
       old_values, new_values, changed_by_user_id
     ) VALUES ('item', $1, $2, $3, $4, 'updated', $5, $6::JSONB, $7::JSONB, $8)`,
    [
      record.item_code,
      record.description,
      record.item_id,
      record.employee_id,
      reason,
      JSON.stringify(oldValues),
      JSON.stringify(newValues),
      changedByUserId,
    ],
  );
}

async function createPendingReturn({
  employeeCode,
  itemCode,
  issuanceId = null,
  quantity = null,
  condition,
  reason,
  tokenHash,
  requestedByUserId,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const issuedResult = await client.query(
      `SELECT employee.id AS employee_id, employee.employee_code, employee.first_name,
              employee.last_name, employee.email AS employee_email,
              issue.id AS issuance_id, issue.status AS issuance_status,
              issue.quantity, issue.returned_quantity, issue.unit_of_measure,
              inventory.id AS item_id, inventory.item_code, inventory.description,
              inventory.inventory_status, inventory.condition AS current_condition,
              inventory.tracking_mode, inventory.issue_behavior
         FROM employees AS employee
         JOIN employee_issuances AS issue ON issue.employee_id = employee.id
         JOIN item_catalog AS inventory ON inventory.id = issue.item_id
        WHERE lower(employee.employee_code) = lower($1)
          AND lower(inventory.item_code) = lower($2)
          AND issue.status = 'Issued'
          AND ($3::BIGINT IS NULL OR issue.id = $3::BIGINT)
        ORDER BY issue.decided_at DESC, issue.id DESC
        LIMIT 1
        FOR UPDATE OF issue, inventory`,
      [employeeCode, itemCode, issuanceId],
    );
    const issued = issuedResult.rows[0];
    if (!issued) {
      throw notFound('Hindi na active at naka-issue sa employee ang item na ito. I-refresh at subukan muli.');
    }
    if (issued.issue_behavior === 'consumable') {
      throw conflict('Consumable stock ay hindi ibinabalik sa return flow. I-record lamang ang aktuwal na quantity na natira sa GSO.');
    }

    const pendingQuantityResult = await client.query(
      `SELECT COALESCE(SUM(quantity), 0)::INTEGER AS quantity
         FROM employee_issuance_returns
        WHERE issuance_id = $1 AND status = 'Pending'`,
      [issued.issuance_id],
    );
    const outstandingQuantity = Number(issued.quantity) - Number(issued.returned_quantity);
    const alreadyPendingQuantity = Number(pendingQuantityResult.rows[0]?.quantity || 0);
    const returnQuantity = quantity === null
      ? outstandingQuantity - alreadyPendingQuantity
      : Number(quantity);
    if (!Number.isInteger(returnQuantity) || returnQuantity < 1 || returnQuantity > outstandingQuantity - alreadyPendingQuantity) {
      throw conflict(`Return quantity must be from 1 to ${Math.max(0, outstandingQuantity - alreadyPendingQuantity)} ${issued.unit_of_measure}.`);
    }

    const inserted = await client.query(
      `INSERT INTO employee_issuance_returns (
         issuance_id, requested_by_user_id, status, token_hash, token_expires_at,
         return_condition, reason, quantity
       ) VALUES ($1, $2, 'Pending', $3, NOW() + INTERVAL '24 hours', $4, $5, $6)
       RETURNING id, status, token_expires_at AS "expiresAt", requested_at AS "requestedAt"`,
      [issued.issuance_id, requestedByUserId, tokenHash, condition, reason, returnQuantity],
    );
    const returnRequest = {
      id: inserted.rows[0].id,
      status: inserted.rows[0].status,
      expiresAt: inserted.rows[0].expiresAt,
      requestedAt: inserted.rows[0].requestedAt,
      employee_id: issued.employee_id,
      employee_code: issued.employee_code,
      employee_name: `${issued.first_name} ${issued.last_name}`,
      employee_email: issued.employee_email,
      issuance_id: issued.issuance_id,
      quantity: returnQuantity,
      unit_of_measure: issued.unit_of_measure,
      issuance_status: issued.issuance_status,
      item_id: issued.item_id,
      item_code: issued.item_code,
      description: issued.description,
      current_condition: issued.current_condition,
      return_condition: condition,
      reason,
    };

    await writeReturnAuditLog(client, returnRequest, {
      changedByUserId: requestedByUserId,
      reason: `Return request for ${returnQuantity} ${issued.unit_of_measure} from ${returnRequest.employee_name} is awaiting employee email approval.`,
      oldValues: {
        issuanceStatus: 'Issued',
        inventoryStatus: 'Issued',
        condition: issued.current_condition,
      },
      newValues: {
        issuanceStatus: 'Issued',
        inventoryStatus: 'Issued',
        returnStatus: 'Pending',
        returnQuantity,
        returnCondition: condition,
        returnReason: reason,
      },
    });

    await client.query('COMMIT');
    return returnRequest;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505' && error.constraint === 'employee_issuance_returns_one_pending_idx') {
      throw conflict('May pending return approval na para sa item na ito.');
    }
    throw error;
  } finally {
    client.release();
  }
}

async function confirmReturnByGso({
  employeeCode,
  itemCode,
  issuanceId = null,
  lines,
  otpBreakdown,
  reason,
  returnedByName = null,
  otpChallengeId,
  otpHash,
  tokenHash,
  requestedByUserId,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const issuedResult = await client.query(
      `SELECT employee.id AS employee_id, employee.employee_code, employee.first_name,
              employee.last_name, employee.email AS employee_email,
              issue.id AS issuance_id, issue.status AS issuance_status,
              issue.quantity, issue.returned_quantity, issue.unit_of_measure,
              inventory.id AS item_id, inventory.item_code, inventory.description,
              inventory.inventory_status, inventory.condition AS current_condition,
              inventory.tracking_mode, inventory.issue_behavior
         FROM employees AS employee
         JOIN employee_issuances AS issue ON issue.employee_id = employee.id
         JOIN item_catalog AS inventory ON inventory.id = issue.item_id
        WHERE lower(employee.employee_code) = lower($1)
          AND lower(inventory.item_code) = lower($2)
          AND issue.status = 'Issued'
          AND ($3::BIGINT IS NULL OR issue.id = $3::BIGINT)
        ORDER BY issue.decided_at DESC, issue.id DESC
        LIMIT 1
        FOR UPDATE OF issue, inventory`,
      [employeeCode, itemCode, issuanceId],
    );
    const issued = issuedResult.rows[0];
    if (!issued) {
      throw notFound('Hindi na active at naka-issue sa employee ang item na ito. I-refresh at subukan muli.');
    }
    if (issued.issue_behavior === 'consumable') {
      throw conflict('Consumable stock ay hindi ibinabalik sa return flow. I-record lamang ang aktuwal na quantity na natira sa GSO.');
    }

    const outstandingQuantity = Number(issued.quantity) - Number(issued.returned_quantity);
    const returnQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    if (!Number.isInteger(returnQuantity) || returnQuantity < 1 || returnQuantity > outstandingQuantity) {
      throw conflict(`Return quantity must be from 1 to ${outstandingQuantity} ${issued.unit_of_measure}.`);
    }

    // The employee's one-time code must match this issuance and the exact quantity breakdown, and
    // is used once.
    const otpUse = otpChallengeId && otpHash
      ? await client.query(
        `UPDATE asset_return_otps
            SET used_at = NOW()
          WHERE id = $1 AND issuance_id = $2 AND asset_unit_tag_id IS NULL AND token_hash = $5
            AND override_reason IS NULL AND used_at IS NULL AND expires_at > NOW()
            AND quantity = $3 AND return_condition = $4`,
        [otpChallengeId, issued.issuance_id, returnQuantity, otpBreakdown, otpHash],
      )
      : { rowCount: 0 };
    if (otpUse.rowCount !== 1) {
      throw conflict('Nag-expire o nagamit na ang code ng employee. Magpadala ng bagong code.');
    }
    const confirmationMethod = 'employee_code';
    const confirmationText = 'Employee confirmed the quantity and condition with an emailed one-time code.';
    const decisionNote = 'Return confirmed by GSO staff; the employee confirmed the quantity and condition with an emailed one-time code.';

    // An older emailed return request no longer decides the quantity; the confirmed return replaces it.
    await client.query(
      `UPDATE employee_issuance_returns
          SET status = 'Expired',
              decision_note = 'Superseded by a GSO-confirmed quantity return.',
              decided_at = NOW()
        WHERE issuance_id = $1 AND status = 'Pending'`,
      [issued.issuance_id],
    );

    // One return row per condition, so damaged and lost units can be followed up on their own.
    const savedLines = [];
    for (const [index, line] of lines.entries()) {
      const isLost = line.condition === 'Lost';
      // token_hash is unique per row; these rows are already decided, so no link ever uses them.
      const lineTokenHash = index === 0 ? tokenHash : crypto.createHash('sha256').update(`${tokenHash}:${index}`).digest('hex');
      const inserted = await client.query(
        `INSERT INTO employee_issuance_returns (
           issuance_id, requested_by_user_id, status, token_hash, token_expires_at,
           return_condition, reason, decision_note, decided_at, quantity,
           returned_by_name, confirmation_method, settlement_status
         ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, NOW(), $8, $9, $10, $11)
         RETURNING id, status, requested_at AS "requestedAt", decided_at AS "decidedAt"`,
        [
          issued.issuance_id, requestedByUserId, isLost ? 'Lost' : 'Returned', lineTokenHash,
          line.condition, reason, isLost ? `Units reported lost by the employee. ${decisionNote}` : decisionNote,
          line.quantity, returnedByName, confirmationMethod, isLost ? 'Pending' : null,
        ],
      );
      savedLines.push({ ...inserted.rows[0], condition: line.condition, quantity: line.quantity });
    }

    const issuanceUpdate = await client.query(
      `UPDATE employee_issuances
          SET returned_quantity = returned_quantity + $2,
              status = CASE WHEN returned_quantity + $2 >= quantity THEN 'Returned' ELSE 'Issued' END
        WHERE id = $1 AND status = 'Issued' AND returned_quantity + $2 <= quantity`,
      [issued.issuance_id, returnQuantity],
    );
    if (issuanceUpdate.rowCount !== 1) {
      throw conflict('Hindi na active ang item issuance. I-refresh ang employee at inventory records.');
    }

    // Bulk stock keeps one shared condition, so damaged units are set aside by count instead of
    // rewriting the condition of every unit in stock; lost units leave the stock.
    const repairQuantity = lines.filter((line) => repairReturnConditions.includes(line.condition))
      .reduce((sum, line) => sum + line.quantity, 0);
    const lostQuantity = lines.filter((line) => line.condition === 'Lost').reduce((sum, line) => sum + line.quantity, 0);
    if (repairQuantity || lostQuantity) {
      await client.query(
        `UPDATE item_catalog
            SET repair_quantity = repair_quantity + $2,
                quantity = GREATEST(quantity - $3, 0)
          WHERE id = $1`,
        [issued.item_id, repairQuantity, lostQuantity],
      );
    }
    const inventoryStatus = await refreshInventoryStatus(client, issued.item_id);

    const employeeName = `${issued.first_name} ${issued.last_name}`;
    let returnedSoFar = Number(issued.returned_quantity);
    for (const line of savedLines) {
      returnedSoFar += line.quantity;
      const isLost = line.condition === 'Lost';
      await writeReturnAuditLog(client, {
        employee_id: issued.employee_id,
        item_id: issued.item_id,
        item_code: issued.item_code,
        description: issued.description,
      }, {
        changedByUserId: requestedByUserId,
        reason: [
          isLost
            ? `${line.quantity} ${issued.unit_of_measure} reported LOST by GSO for ${issued.employee_code}; removed from stock pending settlement.`
            : `Return of ${line.quantity} ${issued.unit_of_measure} confirmed by GSO staff for ${issued.employee_code}; return condition ${line.condition}${repairReturnConditions.includes(line.condition) ? '; set aside for repair' : ''}.`,
          confirmationText,
          returnedByName ? `Brought in by ${returnedByName}.` : '',
        ].filter(Boolean).join(' '),
        oldValues: {
          returnStatus: null,
          issuanceStatus: 'Issued',
          inventoryStatus: 'Issued',
        },
        newValues: {
          returnStatus: isLost ? 'Lost' : 'Returned',
          issuanceStatus: returnedSoFar >= Number(issued.quantity) ? 'Returned' : 'Issued',
          returnedQuantity: returnedSoFar,
          inventoryStatus,
          confirmationMethod,
          // The condition of these returned units only; the stock's shared condition is unchanged.
          condition: line.condition,
        },
      });
    }

    await client.query('COMMIT');
    return {
      id: savedLines[0].id,
      lines: savedLines,
      confirmationMethod,
      employee_id: issued.employee_id,
      employee_code: issued.employee_code,
      employee_name: employeeName,
      employee_email: issued.employee_email,
      issuance_id: issued.issuance_id,
      quantity: returnQuantity,
      unit_of_measure: issued.unit_of_measure,
      remaining_quantity: outstandingQuantity - returnQuantity,
      item_id: issued.item_id,
      item_code: issued.item_code,
      description: issued.description,
      reason,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function createReturnOtp({ tagCode, otpHash, requestedByUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tagResult = await client.query(
      `SELECT tag.id AS tag_id, tag.tag_code, tag.issuance_id, tag.custody_status,
              item.item_code, COALESCE(NULLIF(item.item_name, ''), item.description) AS item_name,
              employee.first_name || ' ' || employee.last_name AS employee_name,
              employee.email AS employee_email
         FROM asset_unit_tags AS tag
         JOIN item_catalog AS item ON item.id = tag.item_id
         LEFT JOIN employees AS employee ON employee.id = tag.assigned_employee_id
        WHERE tag.tag_code = $1
        FOR UPDATE OF tag`,
      [tagCode],
    );
    const tag = tagResult.rows[0];
    if (!tag) throw notFound('Walang item o barcode na tumutugma sa code na ito.');
    if (tag.custody_status !== 'Issued' || !tag.issuance_id) {
      throw conflict('Hindi kasalukuyang naka-issue sa employee ang item na ito.');
    }
    if (!tag.employee_email) {
      throw conflict('Walang email ang employee na may hawak nito, kaya hindi mapapadalhan ng code. Idagdag muna ang email niya sa Employee Master Data.');
    }

    // A new code replaces any earlier unused code for this unit.
    await client.query(
      'UPDATE asset_return_otps SET used_at = NOW() WHERE asset_unit_tag_id = $1 AND used_at IS NULL',
      [tag.tag_id],
    );
    const inserted = await client.query(
      `INSERT INTO asset_return_otps (asset_unit_tag_id, issuance_id, requested_by_user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')
       RETURNING id, expires_at AS "expiresAt"`,
      [tag.tag_id, tag.issuance_id, requestedByUserId, otpHash],
    );
    await client.query('COMMIT');
    return {
      challengeId: String(inserted.rows[0].id),
      expiresAt: inserted.rows[0].expiresAt,
      tagCode: tag.tag_code,
      itemCode: tag.item_code,
      itemName: tag.item_name,
      employeeName: tag.employee_name,
      employeeEmail: tag.employee_email,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Compares a submitted code with a locked OTP row; a wrong code is counted and locks the row at five.
async function checkOtpAttempt(client, otp, otpHash) {
  const storedHash = Buffer.from(otp.token_hash, 'hex');
  const submittedHash = Buffer.from(otpHash, 'hex');
  if (storedHash.length === submittedHash.length && crypto.timingSafeEqual(storedHash, submittedHash)) {
    return { status: 'ok' };
  }
  await client.query(
    `UPDATE asset_return_otps
        SET attempts = attempts + 1,
            used_at = CASE WHEN attempts + 1 >= 5 THEN NOW() ELSE used_at END
      WHERE id = $1`,
    [otp.id],
  );
  return { status: 'wrong', attemptsLeft: Math.max(4 - Number(otp.attempts), 0) };
}

// Counts a wrong code in its own transaction, so a failed return cannot roll the attempt back.
async function verifyReturnOtp({ challengeId, tagCode, otpHash }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT otp.id, otp.token_hash, otp.attempts
         FROM asset_return_otps AS otp
         JOIN asset_unit_tags AS tag ON tag.id = otp.asset_unit_tag_id
        WHERE otp.id = $1
          AND tag.tag_code = $2
          AND otp.override_reason IS NULL
          AND otp.used_at IS NULL
          AND otp.expires_at > NOW()
          AND otp.attempts < 5
        FOR UPDATE OF otp`,
      [challengeId, tagCode],
    );
    const otp = found.rows[0];
    const result = otp ? await checkOtpAttempt(client, otp, otpHash) : { status: 'invalid' };
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function createBulkReturnOtp({ issuanceId, quantity, condition, otpHash, requestedByUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const issuedResult = await client.query(
      `SELECT issue.id, issue.status, issue.quantity, issue.returned_quantity, issue.unit_of_measure,
              item.item_code, item.issue_behavior,
              COALESCE(NULLIF(item.item_name, ''), item.description) AS item_name,
              employee.first_name || ' ' || employee.last_name AS employee_name,
              employee.email AS employee_email
         FROM employee_issuances AS issue
         JOIN item_catalog AS item ON item.id = issue.item_id
         JOIN employees AS employee ON employee.id = issue.employee_id
        WHERE issue.id = $1
        FOR UPDATE OF issue`,
      [issuanceId],
    );
    const issued = issuedResult.rows[0];
    if (!issued || issued.status !== 'Issued') {
      throw notFound('Hindi na active at naka-issue sa employee ang item na ito. I-refresh at subukan muli.');
    }
    if (issued.issue_behavior === 'consumable') {
      throw conflict('Consumable stock ay hindi ibinabalik sa return flow.');
    }
    if (!issued.employee_email) {
      throw conflict('Walang email ang employee na may hawak nito, kaya hindi mapapadalhan ng code. Idagdag muna ang email niya sa Employee Master Data.');
    }
    const outstandingQuantity = Number(issued.quantity) - Number(issued.returned_quantity);
    if (quantity > outstandingQuantity) {
      throw conflict(`Return quantity must be from 1 to ${outstandingQuantity} ${issued.unit_of_measure}.`);
    }

    // A new code replaces any earlier unused bulk code for this issuance.
    await client.query(
      `UPDATE asset_return_otps SET used_at = NOW()
        WHERE issuance_id = $1 AND asset_unit_tag_id IS NULL AND used_at IS NULL`,
      [issued.id],
    );
    const inserted = await client.query(
      `INSERT INTO asset_return_otps (issuance_id, quantity, return_condition, requested_by_user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '10 minutes')
       RETURNING id, expires_at AS "expiresAt"`,
      [issued.id, quantity, condition, requestedByUserId, otpHash],
    );
    await client.query('COMMIT');
    return {
      challengeId: String(inserted.rows[0].id),
      expiresAt: inserted.rows[0].expiresAt,
      itemCode: issued.item_code,
      itemName: issued.item_name,
      unitOfMeasure: issued.unit_of_measure,
      employeeName: issued.employee_name,
      employeeEmail: issued.employee_email,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function verifyBulkReturnOtp({ challengeId, issuanceId, quantity, condition, otpHash }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id, token_hash, attempts, quantity, return_condition
         FROM asset_return_otps
        WHERE id = $1
          AND issuance_id = $2
          AND asset_unit_tag_id IS NULL
          AND override_reason IS NULL
          AND used_at IS NULL
          AND expires_at > NOW()
          AND attempts < 5
        FOR UPDATE`,
      [challengeId, issuanceId],
    );
    const otp = found.rows[0];
    let result = { status: 'invalid' };
    if (otp && (Number(otp.quantity) !== quantity || otp.return_condition !== condition)) {
      // The employee approved different details; this is not a guess, so it does not use up an attempt.
      result = { status: 'changed' };
    } else if (otp) {
      result = await checkOtpAttempt(client, otp, otpHash);
    }
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function confirmScannedTagReturn({
  tagCode, condition, reason, entryMethod, returnedByName = null, serialLast4 = '',
  otpChallengeId, otpHash, tokenHash, requestedByUserId,
}) {
  const isLost = condition === 'Lost';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tagResult = await client.query(
      `SELECT tag.id AS tag_id, tag.tag_code, tag.item_id, tag.issuance_id, tag.label_version,
              tag.unit_number, tag.condition AS current_tag_condition,
              tag.lifecycle_status, tag.custody_status, tag.assigned_employee_id,
              tag.assigned_user_id, tag.location,
              COALESCE(NULLIF(btrim(tag.serial_number), ''), NULLIF(btrim(item.serial_number), '')) AS serial_number,
              item.item_code, item.description, item.inventory_status,
              item.condition AS current_item_condition
         FROM asset_unit_tags AS tag
         JOIN item_catalog AS item ON item.id = tag.item_id
        WHERE tag.tag_code = $1
        FOR UPDATE OF tag, item`,
      [tagCode],
    );
    const tag = tagResult.rows[0];
    if (!tag) throw notFound('Walang item o barcode na tumutugma sa code na ito.');
    if (tag.custody_status !== 'Issued' || !tag.issuance_id || !tag.assigned_employee_id) {
      throw conflict('Hindi kasalukuyang naka-issue sa employee ang item na ito. I-check ang custody status bago mag-return.');
    }
    if (tag.lifecycle_status === 'Disposed') {
      throw conflict('Disposed na ang item na ito at hindi na puwedeng i-return sa stock.');
    }
    // The serial printed on the unit itself catches a label copied or moved onto another unit.
    const serialTail = String(tag.serial_number || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(-4);
    if (!isLost && serialTail && serialLast4 !== serialTail) {
      throw Object.assign(new Error(serialLast4
        ? 'Hindi tugma ang serial number ng unit sa record ng barcode na ito. Baka ibang unit ito o napalitan ang label. Huwag munang tanggapin ang return at ipaalam sa GSO head.'
        : 'Ilagay ang huling 4 na character ng serial number na nakasulat sa mismong unit.'), { status: 400 });
    }

    const issuanceResult = await client.query(
      `SELECT issue.id, issue.employee_id, issue.item_id, issue.status,
              issue.quantity, issue.returned_quantity, issue.unit_of_measure,
              employee.employee_code, employee.first_name, employee.last_name,
              employee.email AS employee_email
         FROM employee_issuances AS issue
         JOIN employees AS employee ON employee.id = issue.employee_id
        WHERE issue.id = $1
          AND issue.employee_id = $2
          AND issue.item_id = $3
        FOR UPDATE OF issue`,
      [tag.issuance_id, tag.assigned_employee_id, tag.item_id],
    );
    const issuance = issuanceResult.rows[0];
    if (!issuance || issuance.status !== 'Issued') {
      throw conflict('Hindi na active ang issuance na nakatala sa barcode na ito. I-refresh ang item records.');
    }
    const outstandingQuantity = Number(issuance.quantity) - Number(issuance.returned_quantity);
    if (outstandingQuantity < 1) {
      throw conflict('Wala nang outstanding na item quantity sa issuance na ito.');
    }

    // Every return needs the borrower's one-time code for this unit and issuance, used once: a scan
    // only identifies the unit, it does not prove the borrower took part.
    const otpUse = otpChallengeId && otpHash
      ? await client.query(
        `UPDATE asset_return_otps
            SET used_at = NOW()
          WHERE id = $1 AND asset_unit_tag_id = $2 AND issuance_id = $3 AND token_hash = $4
            AND override_reason IS NULL AND used_at IS NULL AND expires_at > NOW()`,
        [otpChallengeId, tag.tag_id, issuance.id, otpHash],
      )
      : { rowCount: 0 };
    if (otpUse.rowCount !== 1) {
      throw conflict('Nag-expire o nagamit na ang code ng employee. Magpadala ng bagong code.');
    }
    const confirmationMethod = entryMethod === 'scan' ? 'employee_code' : 'typed_code';

    const pendingReturnResult = await client.query(
      `SELECT id
         FROM employee_issuance_returns
        WHERE issuance_id = $1 AND status = 'Pending'
        ORDER BY requested_at DESC, id DESC
        LIMIT 1
        FOR UPDATE`,
      [issuance.id],
    );
    const pendingReturn = pendingReturnResult.rows[0];
    if (pendingReturn) {
      await client.query(
        `UPDATE employee_issuance_returns
            SET status = 'Expired',
                decision_note = 'Superseded by a GSO-confirmed barcode return.',
                decided_at = NOW()
          WHERE id = $1 AND status = 'Pending'`,
        [pendingReturn.id],
      );
    }

    const destination = isLost
      ? 'Lost'
      : repairReturnConditions.includes(condition) ? 'To Be Repaired' : 'GSO Storage';
    const confirmationNotes = {
      employee_code: 'Return confirmed by GSO via barcode scan; the employee confirmed it with an emailed one-time code.',
      typed_code: 'Return confirmed by GSO using a manually typed barcode code; the employee confirmed it with an emailed one-time code.',
    };
    const decisionNote = isLost
      ? `Unit reported lost by the employee. ${confirmationNotes[confirmationMethod]}`
      : confirmationNotes[confirmationMethod];
    const returnedResult = await client.query(
      `INSERT INTO employee_issuance_returns (
         issuance_id, asset_unit_tag_id, requested_by_user_id, status, token_hash,
         token_expires_at, return_condition, reason, decision_note, decided_at, quantity,
         returned_by_name, confirmation_method, tag_snapshot, settlement_status
       ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, NOW(), 1, $9, $10, $11::JSONB, $12)
       RETURNING id, status, requested_at AS "requestedAt", decided_at AS "decidedAt"`,
      [
        issuance.id, tag.tag_id, requestedByUserId, isLost ? 'Lost' : 'Returned', tokenHash,
        condition, reason, decisionNote, returnedByName, confirmationMethod,
        // What the tag looked like while issued, including the barcode, which is retired below.
        JSON.stringify({
          tagCode: tag.tag_code,
          condition: tag.current_tag_condition,
          location: tag.location,
          assignedUserId: tag.assigned_user_id,
          assignedEmployeeId: tag.assigned_employee_id,
          issuanceId: String(issuance.id),
        }),
        isLost ? 'Pending' : null,
      ],
    );

    const issuanceUpdate = await client.query(
      `UPDATE employee_issuances
          SET returned_quantity = returned_quantity + 1,
              status = CASE WHEN returned_quantity + 1 >= quantity THEN 'Returned' ELSE 'Issued' END
        WHERE id = $1 AND status = 'Issued' AND returned_quantity + 1 <= quantity`,
      [issuance.id],
    );
    const tagUpdate = isLost
      ? await client.query(
        `UPDATE asset_unit_tags
            SET custody_status = 'Available',
                lifecycle_status = 'Disposed',
                disposal_reason = $2,
                assigned_employee_id = NULL,
                assigned_user_id = NULL,
                issuance_id = NULL,
                location = 'Lost',
                last_inspected_at = NOW(),
                last_inspected_by_user_id = $3,
                last_inspection_note = $4,
                updated_at = NOW()
          WHERE id = $1 AND custody_status = 'Issued'`,
        [tag.tag_id, `Lost while issued to ${issuance.employee_code}.`, requestedByUserId, reason],
      )
      : await client.query(
        `UPDATE asset_unit_tags
            SET custody_status = 'Available',
                assigned_employee_id = NULL,
                assigned_user_id = NULL,
                issuance_id = NULL,
                condition = $2,
                location = $3,
                last_inspected_at = NOW(),
                last_inspected_by_user_id = $4,
                last_inspection_note = $5,
                updated_at = NOW()
          WHERE id = $1 AND custody_status = 'Issued'`,
        [tag.tag_id, condition, destination, requestedByUserId, reason],
      );
    if (issuanceUpdate.rowCount !== 1 || tagUpdate.rowCount !== 1) {
      throw conflict('Nagbago ang custody record habang kinukumpirma ang return. I-scan muli ang barcode.');
    }
    if (isLost) {
      // The lost unit is gone from stock; replacing it later adds it back.
      await client.query('UPDATE item_catalog SET quantity = GREATEST(quantity - 1, 0) WHERE id = $1', [tag.item_id]);
    } else {
      // A barcode lasts one issuance; the unit gets a fresh one that prints when it is issued again.
      await retireUnitLabel(client, {
        tagId: tag.tag_id, oldTagCode: tag.tag_code, labelVersion: tag.label_version,
        kind: 'return', reason: `Unit returned to GSO from ${issuance.employee_code}.`, userId: requestedByUserId,
      });
    }

    const inventoryStatus = await refreshInventoryStatus(client, tag.item_id);
    const record = {
      item_id: tag.item_id,
      item_code: tag.item_code,
      description: tag.description,
      employee_id: issuance.employee_id,
      employee_code: issuance.employee_code,
      employee_name: `${issuance.first_name} ${issuance.last_name}`,
      quantity: 1,
    };
    await writeReturnAuditLog(client, record, {
      changedByUserId: requestedByUserId,
      reason: [
        isLost
          ? `Barcode ${tag.tag_code} reported LOST by GSO for ${issuance.employee_code}; removed from stock pending settlement.`
          : `Barcode ${tag.tag_code} returned by GSO for ${issuance.employee_code}; routed to ${destination}.`,
        entryMethod === 'scan' ? '' : 'MANUAL ENTRY: code was typed, not scanned.',
        'Employee confirmed with an emailed one-time code.',
        returnedByName ? `Brought in by ${returnedByName}.` : '',
        reason,
      ].filter(Boolean).join(' '),
      oldValues: {
        tagCode: tag.tag_code,
        custodyStatus: 'Issued',
        location: tag.location,
        condition: tag.current_tag_condition,
        issuanceStatus: 'Issued',
        inventoryStatus: tag.inventory_status,
      },
      newValues: {
        tagCode: tag.tag_code,
        custodyStatus: 'Available',
        location: destination,
        condition,
        returnStatus: isLost ? 'Lost' : 'Returned',
        entryMethod,
        confirmationMethod,
        issuanceStatus: Number(issuance.returned_quantity) + 1 >= Number(issuance.quantity) ? 'Returned' : 'Issued',
        inventoryStatus,
      },
    });

    await client.query('COMMIT');
    return {
      id: returnedResult.rows[0].id,
      status: returnedResult.rows[0].status,
      requestedAt: returnedResult.rows[0].requestedAt,
      decidedAt: returnedResult.rows[0].decidedAt,
      tagCode: tag.tag_code,
      employeeCode: issuance.employee_code,
      employeeName: record.employee_name,
      employeeEmail: issuance.employee_email,
      itemCode: tag.item_code,
      itemName: tag.description,
      condition,
      destination,
      confirmationMethod,
      remainingQuantity: outstandingQuantity - 1,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function completeTaggedAssetRepair({ tagCode, changedByUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tagResult = await client.query(
      `SELECT tag.id, tag.tag_code, tag.item_id, tag.condition,
              tag.lifecycle_status, tag.custody_status, tag.location,
              item.item_code, item.description
         FROM asset_unit_tags AS tag
         JOIN item_catalog AS item ON item.id = tag.item_id
        WHERE tag.tag_code = $1
        FOR UPDATE OF tag, item`,
      [tagCode],
    );
    const tag = tagResult.rows[0];
    if (!tag) throw notFound('Walang item o barcode na tumutugma sa code na ito.');
    if (tag.custody_status !== 'Available' || tag.lifecycle_status !== 'Active'
      || !['Needs Repair', 'Under Maintenance', 'Unserviceable'].includes(tag.condition)) {
      throw conflict('Hindi na nasa active repair queue ang unit na ito. I-refresh ang repair records.');
    }

    const repairCompletionReason = 'Repair completed from the To Be Repaired module; item condition updated to Good.';
    await client.query(
      `UPDATE asset_unit_tags
          SET condition = 'Good',
              location = 'GSO Storage',
              last_inspected_at = NOW(),
              last_inspected_by_user_id = $2,
              last_inspection_note = $3,
              updated_at = NOW()
        WHERE id = $1`,
      [tag.id, changedByUserId, repairCompletionReason],
    );
    const inventoryStatus = await refreshInventoryStatus(client, tag.item_id);
    await writeReturnAuditLog(client, {
      item_id: tag.item_id,
      item_code: tag.item_code,
      description: tag.description,
      employee_id: null,
    }, {
      changedByUserId,
      reason: repairCompletionReason,
      oldValues: {
        tagCode: tag.tag_code,
        condition: tag.condition,
        lifecycleStatus: tag.lifecycle_status,
        custodyStatus: tag.custody_status,
        location: tag.location,
      },
      newValues: {
        tagCode: tag.tag_code,
        condition: 'Good',
        lifecycleStatus: tag.lifecycle_status,
        custodyStatus: tag.custody_status,
        location: 'GSO Storage',
        inventoryStatus,
      },
    });

    await client.query('COMMIT');
    return { tagCode: tag.tag_code, condition: 'Good', location: 'GSO Storage' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function markReturnEmailSent(returnId) {
  await pool.query(
    `UPDATE employee_issuance_returns
        SET email_sent_at = NOW()
      WHERE id = $1 AND status IN ('Pending', 'Returned')`,
    [returnId],
  );
}

async function markReturnEmailFailed(returnId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT return_request.id, return_request.issuance_id,
              issue.employee_id, issue.item_id, employee.employee_code,
              employee.first_name, employee.last_name, inventory.item_code,
              inventory.description, inventory.condition AS current_condition,
              return_request.return_condition, return_request.reason
         FROM employee_issuance_returns AS return_request
         JOIN employee_issuances AS issue ON issue.id = return_request.issuance_id
         JOIN employees AS employee ON employee.id = issue.employee_id
         JOIN item_catalog AS inventory ON inventory.id = issue.item_id
        WHERE return_request.id = $1 AND return_request.status = 'Pending'
        FOR UPDATE OF return_request, issue, inventory`,
      [returnId],
    );
    const row = result.rows[0];
    if (row) {
      await client.query(
        `UPDATE employee_issuance_returns
            SET status = 'Email Failed',
                decision_note = 'The return approval email could not be delivered.',
                decided_at = NOW()
          WHERE id = $1 AND status = 'Pending'`,
        [returnId],
      );
      await writeReturnAuditLog(client, row, {
        reason: `Return approval email could not be delivered to ${row.employee_code}.`,
        oldValues: { returnStatus: 'Pending', inventoryStatus: 'Issued' },
        newValues: { returnStatus: 'Email Failed', inventoryStatus: 'Issued' },
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function lookupReturnApproval(tokenHash) {
  const result = await pool.query(
    `SELECT return_request.status,
            return_request.token_expires_at AS "expiresAt",
            return_request.return_condition AS condition,
            return_request.reason,
            return_request.quantity,
            issue.unit_of_measure AS "unitOfMeasure",
            return_request.requested_at AS "requestedAt",
            employee.first_name || ' ' || employee.last_name AS "employeeName",
            employee.employee_code AS "employeeCode",
            inventory.item_code AS "itemCode",
            inventory.description AS "itemName"
       FROM employee_issuance_returns AS return_request
       JOIN employee_issuances AS issue ON issue.id = return_request.issuance_id
       JOIN employees AS employee ON employee.id = issue.employee_id
       JOIN item_catalog AS inventory ON inventory.id = issue.item_id
      WHERE return_request.token_hash = $1`,
    [tokenHash],
  );
  return result.rows[0] || null;
}

async function resolveReturnApproval({ tokenHash, action }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT return_request.id, return_request.status, return_request.token_expires_at,
              return_request.return_condition, return_request.reason, return_request.quantity,
              issue.id AS issuance_id, issue.status AS issuance_status,
              issue.quantity AS issued_quantity, issue.returned_quantity, issue.unit_of_measure,
              issue.employee_id, inventory.id AS item_id, inventory.inventory_status,
              inventory.condition AS current_condition, employee.employee_code,
              employee.first_name, employee.last_name, inventory.item_code,
              inventory.description
         FROM employee_issuance_returns AS return_request
         JOIN employee_issuances AS issue ON issue.id = return_request.issuance_id
         JOIN employees AS employee ON employee.id = issue.employee_id
         JOIN item_catalog AS inventory ON inventory.id = issue.item_id
        WHERE return_request.token_hash = $1
        FOR UPDATE OF return_request, issue, inventory`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) {
      await client.query('COMMIT');
      return { notFound: true };
    }

    const record = {
      employee_id: row.employee_id,
      employee_code: row.employee_code,
      employee_name: `${row.first_name} ${row.last_name}`,
      item_id: row.item_id,
      item_code: row.item_code,
      description: row.description,
      quantity: row.quantity,
      unit_of_measure: row.unit_of_measure,
    };

    if (row.status !== 'Pending') {
      await client.query('COMMIT');
      return {
        alreadyDecided: true,
        status: row.status,
        employeeName: record.employee_name,
        itemName: row.description,
      };
    }

    if (new Date(row.token_expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE employee_issuance_returns
            SET status = 'Expired',
                decision_note = 'The employee return approval link expired.',
                decided_at = NOW()
          WHERE id = $1 AND status = 'Pending'`,
        [row.id],
      );
      await writeReturnAuditLog(client, record, {
        reason: `Return approval link expired for ${row.employee_code}; the item remains issued.`,
        oldValues: { returnStatus: 'Pending', issuanceStatus: row.issuance_status, inventoryStatus: row.inventory_status },
        newValues: { returnStatus: 'Expired', issuanceStatus: row.issuance_status, inventoryStatus: row.inventory_status },
      });
      await client.query('COMMIT');
      return { expired: true };
    }

    if (action === 'reject') {
      const decisionNote = 'Return request rejected by employee using the email approval link.';
      await client.query(
        `UPDATE employee_issuance_returns
            SET status = 'Rejected', decision_note = $2, decided_at = NOW()
          WHERE id = $1 AND status = 'Pending'`,
        [row.id, decisionNote],
      );
      await writeReturnAuditLog(client, record, {
        reason: `Return request rejected by employee ${row.employee_code} via emailed approval link.`,
        oldValues: { returnStatus: 'Pending', issuanceStatus: 'Issued', inventoryStatus: 'Issued' },
        newValues: { returnStatus: 'Rejected', issuanceStatus: 'Issued', inventoryStatus: 'Issued' },
      });
      await client.query('COMMIT');
      return {
        status: 'Rejected',
        employeeName: record.employee_name,
        employeeCode: row.employee_code,
        itemName: row.description,
        itemCode: row.item_code,
        quantity: row.quantity,
        unitOfMeasure: row.unit_of_measure,
      };
    }

    if (row.issuance_status !== 'Issued') {
      throw conflict('Hindi na active ang item issuance. Makipag-ugnayan sa GSO para ma-check ang return request.');
    }

    const decisionNote = 'Return confirmed by employee using the email approval link.';
    await client.query(
      `UPDATE employee_issuance_returns
          SET status = 'Returned', decision_note = $2, decided_at = NOW()
        WHERE id = $1 AND status = 'Pending'`,
      [row.id, decisionNote],
    );
    const issuanceUpdate = await client.query(
      `UPDATE employee_issuances
          SET returned_quantity = returned_quantity + $2,
              status = CASE WHEN returned_quantity + $2 >= quantity THEN 'Returned' ELSE 'Issued' END
        WHERE id = $1 AND status = 'Issued' AND returned_quantity + $2 <= quantity`,
      [row.issuance_id, row.quantity],
    );
    const itemUpdate = await client.query(
      `UPDATE item_catalog
          SET condition = $2
        WHERE id = $1`,
      [row.item_id, row.return_condition],
    );
    if (issuanceUpdate.rowCount !== 1 || itemUpdate.rowCount !== 1) {
      throw conflict('Hindi na active ang item issuance. Makipag-ugnayan sa GSO para ma-check ang return request.');
    }
    await client.query(
      `WITH units_to_return AS (
         SELECT id
           FROM asset_unit_tags
          WHERE issuance_id = $1
            AND assigned_employee_id = $2
            AND custody_status = 'Issued'
          ORDER BY unit_number
          LIMIT $3
          FOR UPDATE
       )
       UPDATE asset_unit_tags AS tag
          SET custody_status = 'Available',
              assigned_employee_id = NULL,
              assigned_user_id = NULL,
              issuance_id = NULL,
              condition = $4,
              updated_at = NOW()
         FROM units_to_return
        WHERE tag.id = units_to_return.id`,
      [row.issuance_id, row.employee_id, row.quantity, row.return_condition],
    );
    const inventoryStatus = await refreshInventoryStatus(client, row.item_id);
    const nextIssuanceStatus = Number(row.returned_quantity) + Number(row.quantity) >= Number(row.issued_quantity)
      ? 'Returned'
      : 'Issued';

    await writeReturnAuditLog(client, record, {
      reason: `Item return confirmed by employee ${row.employee_code} via emailed approval link.`,
      oldValues: {
        returnStatus: 'Pending',
        issuanceStatus: 'Issued',
        inventoryStatus: row.inventory_status,
        condition: row.current_condition,
      },
      newValues: {
        returnStatus: 'Returned',
        issuanceStatus: nextIssuanceStatus,
        returnedQuantity: Number(row.returned_quantity) + Number(row.quantity),
        inventoryStatus,
        condition: row.return_condition,
      },
    });

    await client.query('COMMIT');
    return {
      status: 'Returned',
      employeeName: record.employee_name,
      employeeCode: row.employee_code,
      itemName: row.description,
      itemCode: row.item_code,
      quantity: row.quantity,
      unitOfMeasure: row.unit_of_measure,
      condition: row.return_condition,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function expirePendingReturns() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const expiredResult = await client.query(
      `SELECT return_request.id, issue.employee_id, issue.item_id,
              employee.employee_code, employee.first_name, employee.last_name,
              inventory.item_code, inventory.description,
              return_request.return_condition, return_request.reason
         FROM employee_issuance_returns AS return_request
         JOIN employee_issuances AS issue ON issue.id = return_request.issuance_id
         JOIN employees AS employee ON employee.id = issue.employee_id
         JOIN item_catalog AS inventory ON inventory.id = issue.item_id
        WHERE return_request.status = 'Pending'
          AND return_request.token_expires_at <= NOW()
        ORDER BY return_request.token_expires_at, return_request.id
        LIMIT 100
        FOR UPDATE OF return_request SKIP LOCKED`,
    );

    for (const request of expiredResult.rows) {
      await client.query(
        `UPDATE employee_issuance_returns
            SET status = 'Expired',
                decision_note = 'The employee return approval link expired.',
                decided_at = NOW()
          WHERE id = $1 AND status = 'Pending'`,
        [request.id],
      );
      await writeReturnAuditLog(client, request, {
        reason: `Return approval link expired for ${request.employee_code}; the item remains issued.`,
        oldValues: { returnStatus: 'Pending', issuanceStatus: 'Issued', inventoryStatus: 'Issued' },
        newValues: { returnStatus: 'Expired', issuanceStatus: 'Issued', inventoryStatus: 'Issued' },
      });
    }

    await client.query('COMMIT');
    return expiredResult.rowCount;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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

async function lockReturnForFollowUp(client, returnId) {
  const result = await client.query(
    `SELECT return_record.id, return_record.status, return_record.quantity, return_record.return_condition,
            return_record.repair_resolved_at, return_record.settlement_status,
            return_record.asset_unit_tag_id, return_record.tag_snapshot, return_record.approval_action, return_record.approval_note,
            return_record.approval_requested_by_user_id,
            issue.id AS issuance_id, issue.employee_id, issue.item_id, issue.unit_of_measure,
            item.item_code, item.description,
            employee.employee_code
       FROM employee_issuance_returns AS return_record
       JOIN employee_issuances AS issue ON issue.id = return_record.issuance_id
       JOIN item_catalog AS item ON item.id = issue.item_id
       JOIN employees AS employee ON employee.id = issue.employee_id
      WHERE return_record.id = $1
      FOR UPDATE OF return_record, issue, item`,
    [returnId],
  );
  const record = result.rows[0];
  if (!record) throw notFound('Hindi makita ang return record.');
  if (record.asset_unit_tag_id) {
    const tag = await client.query(
      `SELECT COALESCE($2, tag_code) AS tag_code, custody_status, lifecycle_status, condition
         FROM asset_unit_tags WHERE id = $1 FOR UPDATE`,
      [record.asset_unit_tag_id, record.tag_snapshot?.tagCode ?? null],
    );
    record.tag = tag.rows[0];
  }
  return record;
}

function unitLabel(record) {
  return record.tag ? `unit ${record.tag.tag_code}` : `${Number(record.quantity)} ${record.unit_of_measure}`;
}

function isAwaitingRepair(record) {
  return record.status === 'Returned' && repairReturnConditions.includes(record.return_condition) && !record.repair_resolved_at;
}

function isAwaitingSettlement(record) {
  return record.status === 'Lost' && record.settlement_status === 'Pending';
}

// Closes a damaged return in To Be Repaired: the units go back to stock or leave it for good.
async function applyRepairOutcome(client, record, { outcome, note, userId, approvalText = '' }) {
  if (!isAwaitingRepair(record)) {
    throw conflict(record.repair_resolved_at ? 'Tapos na ang repair record na ito.' : 'Hindi ito return na nasa repair.');
  }
  const quantity = Number(record.quantity);

  if (record.tag) {
    if (record.tag.custody_status !== 'Available' || record.tag.lifecycle_status === 'Disposed'
      || !repairReturnConditions.includes(record.tag.condition)) {
      throw conflict('Hindi na nasa repair queue ang unit na ito. I-refresh ang repair records.');
    }
    await client.query(
      outcome === 'Repaired'
        ? `UPDATE asset_unit_tags
              SET condition = 'Good', location = 'GSO Storage', last_inspected_at = NOW(),
                  last_inspected_by_user_id = $2, last_inspection_note = $3, updated_at = NOW()
            WHERE id = $1`
        : `UPDATE asset_unit_tags
              SET lifecycle_status = 'Disposed', disposal_reason = $3, location = 'Written Off',
                  last_inspected_at = NOW(), last_inspected_by_user_id = $2, last_inspection_note = $3, updated_at = NOW()
            WHERE id = $1`,
      [record.asset_unit_tag_id, userId, note || `${outcome} from the To Be Repaired module.`],
    );
    if (outcome === 'Written Off') {
      await client.query('UPDATE item_catalog SET quantity = GREATEST(quantity - 1, 0) WHERE id = $1', [record.item_id]);
    }
  } else {
    // A bulk item whose whole stock was marked for repair before per-unit counts existed is
    // cleared back to Good when its units are repaired, as the old repair step did.
    await client.query(
      outcome === 'Repaired'
        ? `UPDATE item_catalog
              SET repair_quantity = GREATEST(repair_quantity - $2, 0),
                  condition = CASE
                    WHEN condition IN ('Needs Repair', 'Under Maintenance', 'Unserviceable')
                     AND NOT EXISTS (SELECT 1 FROM asset_unit_tags WHERE item_id = $1)
                    THEN 'Good' ELSE condition END
            WHERE id = $1`
        : `UPDATE item_catalog
              SET repair_quantity = GREATEST(repair_quantity - $2, 0),
                  quantity = GREATEST(quantity - $2, 0)
            WHERE id = $1`,
      [record.item_id, quantity],
    );
  }

  await client.query(
    `UPDATE employee_issuance_returns
        SET repair_outcome = $2, repair_resolved_at = NOW(), repair_resolved_by_user_id = $3
      WHERE id = $1`,
    [record.id, outcome, userId],
  );
  const inventoryStatus = await refreshInventoryStatus(client, record.item_id);
  await writeReturnAuditLog(client, record, {
    changedByUserId: userId,
    reason: `Return #${record.id}: ${unitLabel(record)} of ${record.description} ${outcome === 'Repaired' ? 'repaired and returned to stock' : 'written off and removed from stock'}.${approvalText ? ` ${approvalText}` : ''}${note ? ` ${note}` : ''}`,
    oldValues: { repairOutcome: null, condition: record.return_condition },
    newValues: { repairOutcome: outcome, inventoryStatus, returnId: String(record.id), assetTagCode: record.tag?.tag_code || null },
  });
  return {
    returnId: String(record.id),
    outcome,
    quantity,
    itemCode: record.item_code,
    itemName: record.description,
    tagCode: record.tag?.tag_code || null,
  };
}

async function resolveReturnRepair({ returnId, outcome, note, userId }) {
  return inTransaction(async (client) => applyRepairOutcome(client, await lockReturnForFollowUp(client, returnId), { outcome, note, userId }));
}

async function applySettlement(client, record, { status, note, userId, approvalText = '' }) {
  if (!isAwaitingSettlement(record)) throw conflict('Wala nang nakabinbing settlement ang record na ito.');
  await client.query(
    `UPDATE employee_issuance_returns
        SET settlement_status = $2, settlement_note = $3, settled_at = NOW(), settled_by_user_id = $4
      WHERE id = $1`,
    [record.id, status, note, userId],
  );
  if (status === 'Replaced') {
    // The replacement units enter stock; tagged items get their barcode when next issued.
    await client.query('UPDATE item_catalog SET quantity = quantity + $2 WHERE id = $1', [record.item_id, Number(record.quantity)]);
  }
  const inventoryStatus = await refreshInventoryStatus(client, record.item_id);
  await writeReturnAuditLog(client, record, {
    changedByUserId: userId,
    reason: `Lost item settlement for return #${record.id} (${record.quantity} ${record.unit_of_measure} from ${record.employee_code}): ${status}.${approvalText ? ` ${approvalText}` : ''} ${note}`,
    oldValues: { settlementStatus: 'Pending' },
    newValues: { settlementStatus: status, inventoryStatus, returnId: String(record.id) },
  });
  return { returnId: String(record.id), settlementStatus: status };
}

async function updateReturnSettlement({ returnId, status, note, userId }) {
  return inTransaction(async (client) => applySettlement(client, await lockReturnForFollowUp(client, returnId), { status, note, userId }));
}

// GSO asks IT Admin to write off a damaged return, or to settle a lost one as paid or replaced.
async function requestReturnApproval({ returnId, action, note, userId }) {
  return inTransaction(async (client) => {
    const record = await lockReturnForFollowUp(client, returnId);
    if (action === 'Written Off' ? !isAwaitingRepair(record) : !isAwaitingSettlement(record)) {
      throw conflict(action === 'Written Off'
        ? 'Nasa repair queue lamang na item ang puwedeng i-request na i-write off.'
        : 'Wala nang nakabinbing settlement ang record na ito.');
    }
    if (record.approval_action) throw conflict('May hinihintay nang desisyon ng IT Admin para sa record na ito.');
    await client.query(
      `UPDATE employee_issuance_returns
          SET approval_action = $2, approval_note = $3, approval_requested_by_user_id = $4,
              approval_requested_at = NOW(), approval_decision_note = NULL
        WHERE id = $1`,
      [record.id, action, note, userId],
    );
    await writeReturnAuditLog(client, record, {
      changedByUserId: userId,
      reason: `Return #${record.id}: GSO asked IT Admin to approve "${action}" for ${unitLabel(record)} of ${record.description} from ${record.employee_code}. ${note}`,
      oldValues: { approvalAction: null },
      newValues: { approvalAction: action, returnId: String(record.id) },
    });
    return { returnId: String(record.id), approvalAction: action };
  });
}

// IT Admin approves or declines a GSO request. Whoever asked cannot also decide.
async function decideApprovalRequest({ returnId, decision, note, userId }) {
  return inTransaction(async (client) => {
    const record = await lockReturnForFollowUp(client, returnId);
    const action = record.approval_action;
    const isOpen = action === 'Written Off' ? isAwaitingRepair(record) : Boolean(action) && isAwaitingSettlement(record);
    if (!isOpen) throw conflict('Wala nang hinihintay na approval ang record na ito. I-refresh ang listahan.');
    if (String(record.approval_requested_by_user_id) === String(userId)) {
      throw Object.assign(new Error('Ibang tao ang dapat mag-approve ng request na ikaw mismo ang gumawa.'), { status: 403 });
    }

    if (decision === 'reject') {
      await client.query(
        'UPDATE employee_issuance_returns SET approval_action = NULL, approval_decision_note = $2 WHERE id = $1',
        [record.id, note],
      );
      await writeReturnAuditLog(client, record, {
        changedByUserId: userId,
        reason: `Return #${record.id}: IT Admin declined the GSO request "${action}". ${note}`,
        oldValues: { approvalAction: action },
        newValues: { approvalAction: null, returnId: String(record.id) },
      });
      return { returnId: String(record.id), decision };
    }

    const approvalText = `Requested by GSO and approved by IT Admin${note ? `: ${note}` : ''}.`;
    if (action === 'Written Off') {
      await applyRepairOutcome(client, record, { outcome: action, note: record.approval_note, userId, approvalText });
    } else {
      await applySettlement(client, record, { status: action, note: record.approval_note, userId, approvalText });
    }
    return { returnId: String(record.id), decision };
  });
}

// Requests still waiting for IT Admin. A request closes on its own once the record is settled,
// repaired, or written off another way.
async function listApprovalRequests({ userId }) {
  const result = await pool.query(
    `SELECT return_record.id::TEXT AS "returnId",
            return_record.approval_action AS action,
            return_record.approval_note AS note,
            return_record.approval_requested_at AS "requestedAt",
            requester.name AS "requestedBy",
            return_record.approval_requested_by_user_id = $1 AS "requestedByYou",
            return_record.quantity,
            return_record.return_condition AS condition,
            COALESCE(return_record.decided_at, return_record.requested_at) AS "returnedAt",
            return_record.reason,
            issue.unit_of_measure AS "unitOfMeasure",
            item.item_code AS "itemCode",
            COALESCE(NULLIF(item.item_name, ''), item.description) AS "itemName",
            employee.employee_code AS "employeeCode",
            employee.first_name || ' ' || employee.last_name AS "employeeName",
            COALESCE(return_record.tag_snapshot->>'tagCode', tag.tag_code) AS "tagCode"
       FROM employee_issuance_returns AS return_record
       JOIN employee_issuances AS issue ON issue.id = return_record.issuance_id
       JOIN item_catalog AS item ON item.id = issue.item_id
       JOIN employees AS employee ON employee.id = issue.employee_id
       LEFT JOIN asset_unit_tags AS tag ON tag.id = return_record.asset_unit_tag_id
       LEFT JOIN users AS requester ON requester.id = return_record.approval_requested_by_user_id
      WHERE (return_record.approval_action = 'Written Off' AND return_record.status = 'Returned'
             AND return_record.repair_resolved_at IS NULL)
         OR (return_record.approval_action IN ('Paid', 'Replaced') AND return_record.status = 'Lost'
             AND return_record.settlement_status = 'Pending')
      ORDER BY return_record.approval_requested_at, return_record.id`,
    [userId],
  );
  return result.rows;
}

// Everything still out with people, for the Return Items list and employee clearance.
async function listHoldings({ employeeCode = null } = {}) {
  const [issued, borrowed, accountabilities] = await Promise.all([
    pool.query(
      `SELECT issue.id::TEXT AS "issuanceId",
              'GSO issuance' AS source,
              employee.employee_code AS "employeeCode",
              employee.first_name || ' ' || employee.last_name AS "employeeName",
              employee.department,
              item.item_code AS "itemCode",
              COALESCE(NULLIF(item.item_name, ''), item.description) AS "itemName",
              item.tracking_mode AS "trackingMode",
              issue.quantity - issue.returned_quantity AS quantity,
              issue.unit_of_measure AS "unitOfMeasure",
              issue.item_condition AS "conditionAtIssue",
              issue.decided_at AS "issuedAt",
              COALESCE(batch.expected_return_at, batch.expected_return_date::TIMESTAMP AT TIME ZONE 'Asia/Manila') AS "dueAt",
              COALESCE(batch.expected_return_at < NOW(), batch.expected_return_date < (NOW() AT TIME ZONE 'Asia/Manila')::DATE, FALSE) AS "isOverdue",
              COALESCE((
                SELECT json_agg(tag.tag_code ORDER BY tag.unit_number)
                  FROM asset_unit_tags AS tag
                 WHERE tag.issuance_id = issue.id AND tag.custody_status = 'Issued'
              ), '[]'::JSON) AS "tagCodes",
              NULL::TEXT AS "referenceNo"
         FROM employee_issuances AS issue
         JOIN employees AS employee ON employee.id = issue.employee_id
         JOIN item_catalog AS item ON item.id = issue.item_id
         LEFT JOIN employee_issuance_batches AS batch ON batch.id = issue.batch_id
        WHERE issue.status = 'Issued'
          AND issue.quantity > issue.returned_quantity
          AND item.issue_behavior = 'returnable'
          AND ($1::TEXT IS NULL OR lower(employee.employee_code) = lower($1))
        ORDER BY 14 DESC, employee.last_name, item.item_code`,
      [employeeCode],
    ),
    pool.query(
      `SELECT asset.id::TEXT AS "issuanceId",
              'Request Center' AS source,
              identity.employee_code AS "employeeCode",
              requester.name AS "employeeName",
              COALESCE(employee.department, '') AS department,
              item.item_code AS "itemCode",
              COALESCE(NULLIF(item.item_name, ''), item.description) AS "itemName",
              item.tracking_mode AS "trackingMode",
              asset.quantity,
              asset.unit_of_measure AS "unitOfMeasure",
              asset.condition_out AS "conditionAtIssue",
              asset.issued_at AS "issuedAt",
              asset.due_date::TIMESTAMP AT TIME ZONE 'Asia/Manila' AS "dueAt",
              COALESCE(asset.due_date < (NOW() AT TIME ZONE 'Asia/Manila')::DATE, FALSE) AS "isOverdue",
              '[]'::JSON AS "tagCodes",
              request.reference_no AS "referenceNo"
         FROM service_request_assets AS asset
         JOIN service_requests AS request ON request.id = asset.request_id
         JOIN users AS requester ON requester.id = request.requested_by_user_id
         JOIN item_catalog AS item ON item.id = asset.item_id
         LEFT JOIN requester_identity_profiles AS identity
           ON identity.user_id = request.requested_by_user_id AND identity.verification_status = 'Verified'
         LEFT JOIN employees AS employee ON lower(employee.employee_code) = lower(identity.employee_code)
        WHERE request.request_type = 'BORROWING'
          AND request.status IN ('Issued', 'Return Requested')
          AND asset.returned_at IS NULL
          AND ($1::TEXT IS NULL OR lower(identity.employee_code) = lower($1))
        ORDER BY 14 DESC, requester.name, item.item_code`,
      [employeeCode],
    ),
    pool.query(
      `SELECT return_record.id::TEXT AS "returnId",
              employee.employee_code AS "employeeCode",
              employee.first_name || ' ' || employee.last_name AS "employeeName",
              item.item_code AS "itemCode",
              COALESCE(NULLIF(item.item_name, ''), item.description) AS "itemName",
              return_record.quantity,
              issue.unit_of_measure AS "unitOfMeasure",
              tag.tag_code AS "tagCode",
              return_record.decided_at AS "reportedAt",
              return_record.reason,
              return_record.approval_action AS "approvalAction",
              return_record.approval_note AS "approvalNote",
              return_record.approval_decision_note AS "approvalDecisionNote"
         FROM employee_issuance_returns AS return_record
         JOIN employee_issuances AS issue ON issue.id = return_record.issuance_id
         JOIN employees AS employee ON employee.id = issue.employee_id
         JOIN item_catalog AS item ON item.id = issue.item_id
         LEFT JOIN asset_unit_tags AS tag ON tag.id = return_record.asset_unit_tag_id
        WHERE return_record.status = 'Lost' AND return_record.settlement_status = 'Pending'
          AND ($1::TEXT IS NULL OR lower(employee.employee_code) = lower($1))
        ORDER BY return_record.decided_at DESC`,
      [employeeCode],
    ),
  ]);
  return { items: [...issued.rows, ...borrowed.rows], accountabilities: accountabilities.rows };
}

// One row per GSO issuance with every return made against it, for the Issuance Records page.
// from/to are Manila calendar dates on the issued date (or the request date while pending).
async function listIssuanceRecords({ from = null, to = null, limit = 1000 } = {}) {
  const result = await pool.query(
    `SELECT issue.id::TEXT AS id,
            issue.status AS "issuanceStatus",
            issue.quantity,
            issue.returned_quantity AS "accountedQuantity",
            issue.unit_of_measure AS "unitOfMeasure",
            issue.item_condition AS "conditionAtIssue",
            NULLIF(issue.notes, '') AS "issueNote",
            issue.decision_note AS "decisionNote",
            issue.requested_at AS "requestedAt",
            issue.decided_at AS "decidedAt",
            issuer.name AS "issuedBy",
            COALESCE(batch.expected_return_at, batch.expected_return_date::TIMESTAMP AT TIME ZONE 'Asia/Manila') AS "dueAt",
            COALESCE(batch.expected_return_at < NOW(), batch.expected_return_date < (NOW() AT TIME ZONE 'Asia/Manila')::DATE, FALSE) AS "isPastDue",
            batch.use_purpose AS purpose,
            batch.use_location AS "useLocation",
            item.item_code AS "itemCode",
            COALESCE(NULLIF(item.item_name, ''), item.description) AS "itemName",
            item.category,
            item.tracking_mode AS "trackingMode",
            item.issue_behavior AS "issueBehavior",
            employee.employee_code AS "employeeCode",
            employee.first_name || ' ' || employee.last_name AS "employeeName",
            employee.department,
            employee.position,
            COALESCE((
              SELECT json_agg(DISTINCT used.tag_code ORDER BY used.tag_code)
                FROM (
                  SELECT tag.tag_code FROM asset_unit_tags AS tag WHERE tag.issuance_id = issue.id
                  UNION
                  SELECT COALESCE(returned.tag_snapshot->>'tagCode', returned_tag.tag_code)
                    FROM employee_issuance_returns AS returned
                    JOIN asset_unit_tags AS returned_tag ON returned_tag.id = returned.asset_unit_tag_id
                   WHERE returned.issuance_id = issue.id
                ) AS used
            ), '[]'::JSON) AS "tagCodes",
            COALESCE((
              SELECT json_agg(json_build_object(
                       'id', return_record.id::TEXT,
                       'status', return_record.status,
                       'quantity', COALESCE(return_record.quantity, issue.quantity),
                       'condition', return_record.return_condition,
                       'reason', return_record.reason,
                       'returnedAt', COALESCE(return_record.decided_at, return_record.requested_at),
                       'processedBy', processor.name,
                       'confirmationMethod', return_record.confirmation_method,
                       'returnedByName', return_record.returned_by_name,
                       'tagCode', COALESCE(return_record.tag_snapshot->>'tagCode', return_tag.tag_code),
                       'repairOutcome', return_record.repair_outcome,
                       'repairResolvedAt', return_record.repair_resolved_at,
                       'settlementStatus', return_record.settlement_status,
                       'settlementNote', return_record.settlement_note,
                       'settledAt', return_record.settled_at,
                       'voidReason', return_record.void_reason
                     ) ORDER BY COALESCE(return_record.decided_at, return_record.requested_at), return_record.id)
                FROM employee_issuance_returns AS return_record
                LEFT JOIN users AS processor ON processor.id = return_record.requested_by_user_id
                LEFT JOIN asset_unit_tags AS return_tag ON return_tag.id = return_record.asset_unit_tag_id
               WHERE return_record.issuance_id = issue.id
                 AND return_record.status IN ('Returned', 'Lost', 'Voided')
            ), '[]'::JSON) AS returns
       FROM employee_issuances AS issue
       JOIN employees AS employee ON employee.id = issue.employee_id
       JOIN item_catalog AS item ON item.id = issue.item_id
       LEFT JOIN employee_issuance_batches AS batch ON batch.id = issue.batch_id
       LEFT JOIN users AS issuer ON issuer.id = COALESCE(issue.requested_by_user_id, batch.requested_by_user_id)
      WHERE ($1::DATE IS NULL OR COALESCE(issue.decided_at, issue.requested_at) >= $1::DATE::TIMESTAMP AT TIME ZONE 'Asia/Manila')
        AND ($2::DATE IS NULL OR COALESCE(issue.decided_at, issue.requested_at) < ($2::DATE + 1)::TIMESTAMP AT TIME ZONE 'Asia/Manila')
      ORDER BY COALESCE(issue.decided_at, issue.requested_at) DESC, issue.id DESC
      LIMIT $3`,
    [from, to, limit],
  );
  return result.rows;
}

// Marks overdue reusable-stock borrowings as reminded, at most once a day each, and returns
// what to email. Claimed rows are skipped by other instances running the same sweep.
async function claimOverdueReminders(limit = 10) {
  const claimed = await pool.query(
    `WITH due AS (
       SELECT batch.id
         FROM employee_issuance_batches AS batch
        WHERE batch.status = 'Issued'
          AND COALESCE(batch.expected_return_at < NOW(), batch.expected_return_date < (NOW() AT TIME ZONE 'Asia/Manila')::DATE, FALSE)
          AND (batch.overdue_reminded_at IS NULL OR batch.overdue_reminded_at < NOW() - INTERVAL '23 hours')
          AND EXISTS (
            SELECT 1
              FROM employee_issuances AS issue
              JOIN item_catalog AS item ON item.id = issue.item_id
             WHERE issue.batch_id = batch.id AND issue.status = 'Issued'
               AND issue.quantity > issue.returned_quantity AND item.issue_behavior = 'returnable'
          )
        ORDER BY batch.id
        LIMIT $1
        FOR UPDATE OF batch SKIP LOCKED
     )
     UPDATE employee_issuance_batches AS batch
        SET overdue_reminded_at = NOW()
       FROM due
      WHERE batch.id = due.id
      RETURNING batch.id`,
    [limit],
  );
  if (!claimed.rows.length) return [];
  const details = await pool.query(
    `SELECT batch.id::TEXT AS "batchId",
            employee.email,
            employee.first_name || ' ' || employee.last_name AS "employeeName",
            COALESCE(batch.expected_return_at, batch.expected_return_date::TIMESTAMP AT TIME ZONE 'Asia/Manila') AS "dueAt",
            COALESCE(NULLIF(item.item_name, ''), item.description) AS "itemName",
            item.item_code AS "itemCode",
            issue.quantity - issue.returned_quantity AS outstanding,
            issue.unit_of_measure AS "unitOfMeasure"
       FROM employee_issuance_batches AS batch
       JOIN employees AS employee ON employee.id = batch.employee_id
       JOIN employee_issuances AS issue
         ON issue.batch_id = batch.id AND issue.status = 'Issued' AND issue.quantity > issue.returned_quantity
       JOIN item_catalog AS item ON item.id = issue.item_id AND item.issue_behavior = 'returnable'
      WHERE batch.id = ANY($1::BIGINT[])
      ORDER BY batch.id, item.item_code`,
    [claimed.rows.map((row) => row.id)],
  );
  const byBatch = new Map();
  for (const row of details.rows) {
    const batch = byBatch.get(row.batchId) || { ...row, items: [] };
    batch.items.push({ itemName: row.itemName, itemCode: row.itemCode, outstanding: row.outstanding, unitOfMeasure: row.unitOfMeasure });
    byBatch.set(row.batchId, batch);
  }
  return [...byBatch.values()];
}

module.exports = {
  resolveReturnRepair,
  updateReturnSettlement,
  requestReturnApproval,
  decideApprovalRequest,
  listApprovalRequests,
  listHoldings,
  listIssuanceRecords,
  claimOverdueReminders,
  createPendingReturn,
  confirmReturnByGso,
  createReturnOtp,
  verifyReturnOtp,
  createBulkReturnOtp,
  verifyBulkReturnOtp,
  confirmScannedTagReturn,
  completeTaggedAssetRepair,
  markReturnEmailSent,
  markReturnEmailFailed,
  lookupReturnApproval,
  resolveReturnApproval,
  expirePendingReturns,
};
