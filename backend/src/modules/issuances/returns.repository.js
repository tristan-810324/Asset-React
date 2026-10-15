const pool = require('../../config/db');

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
              inventory.id AS item_id, inventory.item_code, inventory.description,
              inventory.inventory_status, inventory.condition AS current_condition
         FROM employees AS employee
         JOIN employee_issuances AS issue ON issue.employee_id = employee.id
         JOIN item_catalog AS inventory ON inventory.id = issue.item_id
        WHERE lower(employee.employee_code) = lower($1)
          AND lower(inventory.item_code) = lower($2)
          AND issue.status = 'Issued'
          AND inventory.inventory_status = 'Issued'
        ORDER BY issue.decided_at DESC, issue.id DESC
        LIMIT 1
        FOR UPDATE OF issue, inventory`,
      [employeeCode, itemCode],
    );
    const issued = issuedResult.rows[0];
    if (!issued) {
      throw notFound('Hindi na active at naka-issue sa employee ang item na ito. I-refresh at subukan muli.');
    }

    const inserted = await client.query(
      `INSERT INTO employee_issuance_returns (
         issuance_id, requested_by_user_id, status, token_hash, token_expires_at,
         return_condition, reason
       ) VALUES ($1, $2, 'Pending', $3, NOW() + INTERVAL '24 hours', $4, $5)
       RETURNING id, status, token_expires_at AS "expiresAt", requested_at AS "requestedAt"`,
      [issued.issuance_id, requestedByUserId, tokenHash, condition, reason],
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
      reason: `Return request for ${returnRequest.employee_name} is awaiting employee email approval.`,
      oldValues: {
        issuanceStatus: 'Issued',
        inventoryStatus: 'Issued',
        condition: issued.current_condition,
      },
      newValues: {
        issuanceStatus: 'Issued',
        inventoryStatus: 'Issued',
        returnStatus: 'Pending',
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

async function markReturnEmailSent(returnId) {
  await pool.query(
    `UPDATE employee_issuance_returns
        SET email_sent_at = NOW()
      WHERE id = $1 AND status = 'Pending'`,
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
              return_request.return_condition, return_request.reason,
              issue.id AS issuance_id, issue.status AS issuance_status,
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
      };
    }

    if (row.issuance_status !== 'Issued' || row.inventory_status !== 'Issued') {
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
          SET status = 'Returned'
        WHERE id = $1 AND status = 'Issued'`,
      [row.issuance_id],
    );
    const itemUpdate = await client.query(
      `UPDATE item_catalog
          SET inventory_status = 'Available', condition = $2
        WHERE id = $1 AND inventory_status = 'Issued'`,
      [row.item_id, row.return_condition],
    );
    if (issuanceUpdate.rowCount !== 1 || itemUpdate.rowCount !== 1) {
      throw conflict('Hindi na active ang item issuance. Makipag-ugnayan sa GSO para ma-check ang return request.');
    }

    await writeReturnAuditLog(client, record, {
      reason: `Item return confirmed by employee ${row.employee_code} via emailed approval link.`,
      oldValues: {
        returnStatus: 'Pending',
        issuanceStatus: 'Issued',
        inventoryStatus: 'Issued',
        condition: row.current_condition,
      },
      newValues: {
        returnStatus: 'Returned',
        issuanceStatus: 'Returned',
        inventoryStatus: 'Available',
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
  markReturnEmailSent,
  markReturnEmailFailed,
  lookupReturnApproval,
  resolveReturnApproval,
  expirePendingReturns,
};
