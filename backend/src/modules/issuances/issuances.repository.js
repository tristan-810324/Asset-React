const pool = require('../../config/db');

function notFound(message) {
  return Object.assign(new Error(message), { status: 404 });
}

function conflict(message) {
  return Object.assign(new Error(message), { status: 409 });
}

async function writeAuditLog(client, issuance, {
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
      issuance.item_code,
      issuance.description,
      issuance.item_id,
      issuance.employee_id,
      reason,
      JSON.stringify(oldValues),
      JSON.stringify(newValues),
      changedByUserId,
    ],
  );
}

async function createPendingIssuance({ employeeCode, itemId, notes, tokenHash, requestedByUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const employeeResult = await client.query(
      `SELECT id, employee_code, first_name, last_name, email, status
         FROM employees
        WHERE lower(employee_code) = lower($1)
        FOR SHARE`,
      [employeeCode],
    );
    const employee = employeeResult.rows[0];
    if (!employee) throw notFound('Hindi na makita ang employee profile. I-refresh ang page at subukan muli.');
    if (employee.status !== 'Active') throw conflict('Hindi puwedeng mag-request ng issuance para sa inactive na employee.');

    const itemResult = await client.query(
      `SELECT id, item_code, description, condition, inventory_status, quantity
         FROM item_catalog
        WHERE id = $1
        FOR UPDATE`,
      [itemId],
    );
    const item = itemResult.rows[0];
    if (!item) throw notFound('Hindi na makita ang inventory item. I-refresh ang inventory at pumili muli.');
    if (item.inventory_status !== 'Available' || item.quantity < 1) {
      throw conflict('Hindi na available ang item na ito. I-refresh ang inventory at pumili muli.');
    }

    await client.query(
      `UPDATE item_catalog
          SET inventory_status = 'Reserved'
        WHERE id = $1`,
      [item.id],
    );

    const inserted = await client.query(
      `INSERT INTO employee_issuances (
         employee_id, item_id, requested_by_user_id, status, token_hash,
         token_expires_at, item_condition, notes
       ) VALUES ($1, $2, $3, 'Pending', $4, NOW() + INTERVAL '24 hours', $5, $6)
       RETURNING id, status, token_expires_at AS "expiresAt", requested_at AS "requestedAt"`,
      [employee.id, item.id, requestedByUserId, tokenHash, item.condition, notes],
    );
    const issuance = {
      id: inserted.rows[0].id,
      status: inserted.rows[0].status,
      expiresAt: inserted.rows[0].expiresAt,
      requestedAt: inserted.rows[0].requestedAt,
      employee_id: employee.id,
      employee_code: employee.employee_code,
      employee_name: `${employee.first_name} ${employee.last_name}`,
      employee_email: employee.email,
      item_id: item.id,
      item_code: item.item_code,
      description: item.description,
      item_condition: item.condition,
    };

    await writeAuditLog(client, issuance, {
      changedByUserId: requestedByUserId,
      reason: `Issuance request for ${issuance.employee_name} is awaiting employee email approval.`,
      oldValues: { inventoryStatus: 'Available' },
      newValues: {
        inventoryStatus: 'Reserved',
        issuanceStatus: 'Pending',
        employeeCode: employee.employee_code,
        employeeEmail: employee.email,
      },
    });

    await client.query('COMMIT');
    return issuance;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505' && error.constraint === 'employee_issuances_one_active_item_idx') {
      throw conflict('May pending o active issuance na ang item na ito.');
    }
    throw error;
  } finally {
    client.release();
  }
}

async function markEmailSent(issuanceId) {
  await pool.query(
    `UPDATE employee_issuances
        SET email_sent_at = NOW()
      WHERE id = $1 AND status = 'Pending'`,
    [issuanceId],
  );
}

async function markEmailFailed(issuanceId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT issue.id, issue.employee_id, issue.item_id, inventory.item_code,
              inventory.description, employee.employee_code, employee.first_name,
              employee.last_name
         FROM employee_issuances AS issue
         JOIN employees AS employee ON employee.id = issue.employee_id
         JOIN item_catalog AS inventory ON inventory.id = issue.item_id
        WHERE issue.id = $1 AND issue.status = 'Pending'
        FOR UPDATE OF issue, inventory`,
      [issuanceId],
    );
    const issuance = result.rows[0];
    if (issuance) {
      await client.query(
        `UPDATE employee_issuances
            SET status = 'Email Failed',
                decision_note = 'The approval email could not be delivered.',
                decided_at = NOW()
          WHERE id = $1`,
        [issuanceId],
      );
      await client.query(
        `UPDATE item_catalog
            SET inventory_status = 'Available'
          WHERE id = $1 AND inventory_status = 'Reserved'`,
        [issuance.item_id],
      );
      await writeAuditLog(client, issuance, {
        reason: `Issuance approval email could not be delivered to ${issuance.employee_code}; the item was released.`,
        oldValues: { issuanceStatus: 'Pending', inventoryStatus: 'Reserved' },
        newValues: { issuanceStatus: 'Email Failed', inventoryStatus: 'Available' },
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

async function lookupApproval(tokenHash) {
  const result = await pool.query(
    `SELECT issue.status,
            issue.token_expires_at AS "expiresAt",
            issue.item_condition AS condition,
            issue.requested_at AS "requestedAt",
            employee.first_name || ' ' || employee.last_name AS "employeeName",
            employee.employee_code AS "employeeCode",
            inventory.item_code AS "itemCode",
            inventory.description AS "itemName"
       FROM employee_issuances AS issue
       JOIN employees AS employee ON employee.id = issue.employee_id
       JOIN item_catalog AS inventory ON inventory.id = issue.item_id
      WHERE issue.token_hash = $1`,
    [tokenHash],
  );
  return result.rows[0] || null;
}

async function resolveApproval({ tokenHash, action }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT issue.id, issue.status, issue.token_expires_at, issue.employee_id,
              issue.item_id, issue.item_condition, issue.notes, employee.employee_code,
              employee.first_name, employee.last_name, inventory.item_code,
              inventory.description, inventory.inventory_status
         FROM employee_issuances AS issue
         JOIN employees AS employee ON employee.id = issue.employee_id
         JOIN item_catalog AS inventory ON inventory.id = issue.item_id
        WHERE issue.token_hash = $1
        FOR UPDATE OF issue, inventory`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) {
      await client.query('COMMIT');
      return { notFound: true };
    }

    const issuance = {
      id: row.id,
      employee_id: row.employee_id,
      employee_code: row.employee_code,
      employee_name: `${row.first_name} ${row.last_name}`,
      item_id: row.item_id,
      item_code: row.item_code,
      description: row.description,
    };

    if (row.status !== 'Pending') {
      await client.query('COMMIT');
      return { alreadyDecided: true, status: row.status, employeeName: issuance.employee_name, itemName: row.description };
    }

    if (new Date(row.token_expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE employee_issuances
            SET status = 'Expired',
                decision_note = 'The employee approval link expired.',
                decided_at = NOW()
          WHERE id = $1`,
        [row.id],
      );
      await client.query(
        `UPDATE item_catalog
            SET inventory_status = 'Available'
          WHERE id = $1 AND inventory_status = 'Reserved'`,
        [row.item_id],
      );
      await writeAuditLog(client, issuance, {
        reason: `Employee approval link expired for ${row.employee_code}; the item was released.`,
        oldValues: { issuanceStatus: 'Pending', inventoryStatus: 'Reserved' },
        newValues: { issuanceStatus: 'Expired', inventoryStatus: 'Available' },
      });
      await client.query('COMMIT');
      return { expired: true };
    }

    const nextStatus = action === 'approve' ? 'Issued' : 'Rejected';
    const decisionNote = action === 'approve'
      ? 'Approved by employee using the email approval link.'
      : 'Rejected by employee using the email approval link.';
    const nextInventoryStatus = action === 'approve' ? 'Issued' : 'Available';

    if (row.inventory_status !== 'Reserved') {
      throw conflict('Hindi na reserved ang inventory item. Makipag-ugnayan sa GSO para ma-check ang request.');
    }

    await client.query(
      `UPDATE employee_issuances
          SET status = $2, decision_note = $3, decided_at = NOW()
        WHERE id = $1 AND status = 'Pending'`,
      [row.id, nextStatus, decisionNote],
    );
    await client.query(
      `UPDATE item_catalog
          SET inventory_status = $2
        WHERE id = $1 AND inventory_status = 'Reserved'`,
      [row.item_id, nextInventoryStatus],
    );
    await writeAuditLog(client, issuance, {
      reason: `${nextStatus} by employee ${row.employee_code} via emailed approval link.`,
      oldValues: { issuanceStatus: 'Pending', inventoryStatus: 'Reserved' },
      newValues: { issuanceStatus: nextStatus, inventoryStatus: nextInventoryStatus },
    });

    await client.query('COMMIT');
    return {
      status: nextStatus,
      employeeName: issuance.employee_name,
      employeeCode: row.employee_code,
      itemName: row.description,
      itemCode: row.item_code,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listEmployeeIssuances(employeeCode) {
  const employeeResult = await pool.query(
    `SELECT id
       FROM employees
      WHERE lower(employee_code) = lower($1)`,
    [employeeCode],
  );
  const employee = employeeResult.rows[0];
  if (!employee) throw notFound('Hindi na makita ang employee profile.');

  const [itemsResult, historyResult] = await Promise.all([
    pool.query(
      `SELECT inventory.item_code AS code,
              inventory.description AS name,
              issue.item_condition AS condition,
              to_char(issue.decided_at, 'Mon DD, YYYY · HH12:MI AM') AS "assignedOn"
         FROM employee_issuances AS issue
         JOIN item_catalog AS inventory ON inventory.id = issue.item_id
        WHERE issue.employee_id = $1 AND issue.status = 'Issued'
        ORDER BY issue.decided_at DESC, issue.id DESC`,
      [employee.id],
    ),
    pool.query(
      `SELECT history.event,
              history.item,
              history.code,
              history.note,
              to_char(history.event_at, 'Mon DD, YYYY') AS date
         FROM (
           SELECT CASE issue.status
                    WHEN 'Pending' THEN 'Pending Approval'
                    WHEN 'Returned' THEN 'Issued'
                    ELSE issue.status
                  END AS event,
                  inventory.description AS item,
                  inventory.item_code AS code,
                  COALESCE(issue.decision_note, issue.notes, '') AS note,
                  COALESCE(issue.decided_at, issue.requested_at) AS event_at,
                  issue.id AS sort_id
             FROM employee_issuances AS issue
             JOIN item_catalog AS inventory ON inventory.id = issue.item_id
            WHERE issue.employee_id = $1

           UNION ALL

           SELECT CASE return_request.status
                    WHEN 'Pending' THEN 'Return Pending Approval'
                    WHEN 'Returned' THEN 'Returned'
                    WHEN 'Rejected' THEN 'Return Rejected'
                    WHEN 'Expired' THEN 'Return Expired'
                    ELSE 'Return Email Failed'
                  END AS event,
                  inventory.description AS item,
                  inventory.item_code AS code,
                  CASE return_request.status
                    WHEN 'Pending' THEN 'Awaiting employee email approval. Condition after return: ' || return_request.return_condition || '. GSO notes: ' || return_request.reason
                    WHEN 'Returned' THEN COALESCE(return_request.decision_note, 'Return confirmed by employee.') || ' Condition after return: ' || return_request.return_condition || '. GSO notes: ' || return_request.reason
                    ELSE COALESCE(return_request.decision_note, return_request.reason)
                  END AS note,
                  COALESCE(return_request.decided_at, return_request.requested_at) AS event_at,
                  return_request.id AS sort_id
             FROM employee_issuance_returns AS return_request
             JOIN employee_issuances AS issue ON issue.id = return_request.issuance_id
             JOIN item_catalog AS inventory ON inventory.id = issue.item_id
            WHERE issue.employee_id = $1
         ) AS history
        ORDER BY history.event_at DESC, history.sort_id DESC`,
      [employee.id],
    ),
  ]);

  return { assignedItems: itemsResult.rows, history: historyResult.rows };
}

async function expirePendingIssuances() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const expiredResult = await client.query(
      `SELECT issue.id, issue.employee_id, issue.item_id, employee.employee_code,
              employee.first_name, employee.last_name, inventory.item_code,
              inventory.description
         FROM employee_issuances AS issue
         JOIN employees AS employee ON employee.id = issue.employee_id
         JOIN item_catalog AS inventory ON inventory.id = issue.item_id
        WHERE issue.status = 'Pending'
          AND issue.token_expires_at <= NOW()
        ORDER BY issue.token_expires_at, issue.id
        LIMIT 100
        FOR UPDATE OF issue, inventory SKIP LOCKED`,
    );

    for (const issuance of expiredResult.rows) {
      await client.query(
        `UPDATE employee_issuances
            SET status = 'Expired',
                decision_note = 'The employee approval link expired.',
                decided_at = NOW()
          WHERE id = $1 AND status = 'Pending'`,
        [issuance.id],
      );
      await client.query(
        `UPDATE item_catalog
            SET inventory_status = 'Available'
          WHERE id = $1 AND inventory_status = 'Reserved'`,
        [issuance.item_id],
      );
      await writeAuditLog(client, issuance, {
        reason: `Employee approval link expired for ${issuance.employee_code}; the item was released.`,
        oldValues: { issuanceStatus: 'Pending', inventoryStatus: 'Reserved' },
        newValues: { issuanceStatus: 'Expired', inventoryStatus: 'Available' },
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
  createPendingIssuance,
  markEmailSent,
  markEmailFailed,
  lookupApproval,
  resolveApproval,
  listEmployeeIssuances,
  expirePendingIssuances,
};
