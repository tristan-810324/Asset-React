const pool = require('../../config/db');
const { refreshInventoryStatus } = require('../inventory/inventory.stock');

function notFound(message) {
  return Object.assign(new Error(message), { status: 404 });
}

function conflict(message) {
  return Object.assign(new Error(message), { status: 409 });
}

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
              inventory.inventory_status, inventory.condition AS current_condition
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
              inventory.inventory_status, inventory.condition AS current_condition
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

    const decisionNote = 'Return confirmed by GSO staff.';
    const pendingResult = await client.query(
      `SELECT id, quantity
         FROM employee_issuance_returns
        WHERE issuance_id = $1 AND status = 'Pending'
        ORDER BY requested_at DESC, id DESC
        LIMIT 1
        FOR UPDATE`,
      [issued.issuance_id],
    );
    const pendingReturn = pendingResult.rows[0];
    const outstandingQuantity = Number(issued.quantity) - Number(issued.returned_quantity);
    const returnQuantity = pendingReturn
      ? Number(pendingReturn.quantity)
      : quantity === null
        ? outstandingQuantity
        : Number(quantity);
    if (!Number.isInteger(returnQuantity) || returnQuantity < 1 || returnQuantity > outstandingQuantity) {
      throw conflict(`Return quantity must be from 1 to ${outstandingQuantity} ${issued.unit_of_measure}.`);
    }
    const returnedResult = pendingReturn
      ? await client.query(
        `UPDATE employee_issuance_returns
            SET requested_by_user_id = $2,
                status = 'Returned',
                token_expires_at = NOW(),
                return_condition = $3,
                reason = $4,
                decision_note = $5,
                requested_at = NOW(),
                decided_at = NOW()
          WHERE id = $1 AND status = 'Pending'
          RETURNING id, status, requested_at AS "requestedAt", decided_at AS "decidedAt"`,
        [pendingReturn.id, requestedByUserId, condition, reason, decisionNote],
      )
      : await client.query(
        `INSERT INTO employee_issuance_returns (
           issuance_id, requested_by_user_id, status, token_hash, token_expires_at,
           return_condition, reason, decision_note, decided_at, quantity
         ) VALUES ($1, $2, 'Returned', $3, NOW(), $4, $5, $6, NOW(), $7)
         RETURNING id, status, requested_at AS "requestedAt", decided_at AS "decidedAt"`,
        [issued.issuance_id, requestedByUserId, tokenHash, condition, reason, decisionNote, returnQuantity],
      );
    const returnedRow = returnedResult.rows[0];
    if (!returnedRow) {
      throw conflict('May nagbago sa return request. I-refresh ang employee at subukan muli.');
    }

    const issuanceUpdate = await client.query(
      `UPDATE employee_issuances
          SET returned_quantity = returned_quantity + $2,
              status = CASE WHEN returned_quantity + $2 >= quantity THEN 'Returned' ELSE 'Issued' END
        WHERE id = $1 AND status = 'Issued' AND returned_quantity + $2 <= quantity`,
      [issued.issuance_id, returnQuantity],
    );
    const itemUpdate = await client.query(
      `UPDATE item_catalog
          SET condition = $2
        WHERE id = $1`,
      [issued.item_id, condition],
    );
    if (issuanceUpdate.rowCount !== 1 || itemUpdate.rowCount !== 1) {
      throw conflict('Hindi na active ang item issuance. I-refresh ang employee at inventory records.');
    }
    const inventoryStatus = await refreshInventoryStatus(client, issued.item_id);

    const returnRecord = {
      employee_id: issued.employee_id,
      employee_code: issued.employee_code,
      employee_name: `${issued.first_name} ${issued.last_name}`,
      item_id: issued.item_id,
      item_code: issued.item_code,
      description: issued.description,
      quantity: returnQuantity,
    };
    await writeReturnAuditLog(client, returnRecord, {
      changedByUserId: requestedByUserId,
      reason: `Return of ${returnQuantity} ${issued.unit_of_measure} confirmed by GSO staff for ${issued.employee_code}.`,
      oldValues: {
        returnStatus: null,
        issuanceStatus: 'Issued',
        inventoryStatus: 'Issued',
        condition: issued.current_condition,
      },
      newValues: {
        returnStatus: 'Returned',
        issuanceStatus: returnQuantity === outstandingQuantity ? 'Returned' : 'Issued',
        returnedQuantity: Number(issued.returned_quantity) + returnQuantity,
        inventoryStatus,
        condition,
      },
    });

    await client.query('COMMIT');
    return {
      id: returnedRow.id,
      status: returnedRow.status,
      requestedAt: returnedRow.requestedAt,
      decidedAt: returnedRow.decidedAt,
      employee_id: issued.employee_id,
      employee_code: issued.employee_code,
      employee_name: returnRecord.employee_name,
      employee_email: issued.employee_email,
      issuance_id: issued.issuance_id,
      quantity: returnQuantity,
      unit_of_measure: issued.unit_of_measure,
      remaining_quantity: outstandingQuantity - returnQuantity,
      item_id: issued.item_id,
      item_code: issued.item_code,
      description: issued.description,
      current_condition: issued.current_condition,
      return_condition: condition,
      reason,
    };
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

module.exports = {
  createPendingReturn,
  confirmReturnByGso,
  markReturnEmailSent,
  markReturnEmailFailed,
  lookupReturnApproval,
  resolveReturnApproval,
  expirePendingReturns,
};
