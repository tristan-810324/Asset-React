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

async function createPendingIssuanceBatch({ employeeCode, itemIds, notes, tokenHash, requestedByUserId }) {
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
        WHERE id = ANY($1::BIGINT[])
        ORDER BY id
        FOR UPDATE`,
      [itemIds],
    );
    if (itemResult.rows.length !== itemIds.length) {
      throw notFound('Hindi na makita ang isa o higit pang inventory item. I-refresh ang inventory at subukan muli.');
    }
    const itemsById = new Map(itemResult.rows.map((item) => [String(item.id), item]));
    const items = itemIds.map((id) => itemsById.get(String(id)));
    const unavailableItem = items.find((item) => !item || item.inventory_status !== 'Available' || item.quantity < 1);
    if (unavailableItem) {
      throw conflict('May isa o higit pang item na hindi na available. I-refresh ang inventory at piliin muli ang mga item.');
    }

    const batchResult = await client.query(
      `INSERT INTO employee_issuance_batches (
         employee_id, requested_by_user_id, status, token_hash, token_expires_at
       ) VALUES ($1, $2, 'Pending', $3, NOW() + INTERVAL '24 hours')
       RETURNING id, status, token_expires_at AS "expiresAt", requested_at AS "requestedAt"`,
      [employee.id, requestedByUserId, tokenHash],
    );
    const batch = batchResult.rows[0];

    await client.query(
      `UPDATE item_catalog
          SET inventory_status = 'Reserved'
        WHERE id = ANY($1::BIGINT[])`,
      [itemIds],
    );

    const issuanceItems = [];
    for (const item of items) {
      const inserted = await client.query(
        `INSERT INTO employee_issuances (
           batch_id, employee_id, item_id, requested_by_user_id, status, token_hash,
           token_expires_at, item_condition, notes
         ) VALUES ($1, $2, $3, $4, 'Pending', NULL, $5, $6, $7)
         RETURNING id`,
        [batch.id, employee.id, item.id, requestedByUserId, batch.expiresAt, item.condition, notes],
      );
      const issuance = {
        id: inserted.rows[0].id,
        employee_id: employee.id,
        employee_code: employee.employee_code,
        employee_name: `${employee.first_name} ${employee.last_name}`,
        employee_email: employee.email,
        item_id: item.id,
        item_code: item.item_code,
        description: item.description,
        item_condition: item.condition,
      };
      issuanceItems.push({
        id: issuance.id,
        itemId: item.id,
        itemCode: item.item_code,
        itemName: item.description,
        condition: item.condition,
      });

      await writeAuditLog(client, issuance, {
        changedByUserId: requestedByUserId,
        reason: `Issuance request for ${issuance.employee_name} is awaiting employee batch email approval.`,
        oldValues: { inventoryStatus: 'Available' },
        newValues: {
          inventoryStatus: 'Reserved',
          issuanceStatus: 'Pending',
          issuanceBatchId: batch.id,
          employeeCode: employee.employee_code,
          employeeEmail: employee.email,
        },
      });
    }

    await client.query('COMMIT');
    return {
      id: batch.id,
      status: batch.status,
      expiresAt: batch.expiresAt,
      requestedAt: batch.requestedAt,
      employee_code: employee.employee_code,
      employee_name: `${employee.first_name} ${employee.last_name}`,
      employee_email: employee.email,
      items: issuanceItems,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505' && error.constraint === 'employee_issuances_one_active_item_idx') {
      throw conflict('May pending o active issuance na ang isa o higit pang item. I-refresh ang inventory at piliin muli.');
    }
    throw error;
  } finally {
    client.release();
  }
}

async function markBatchEmailSent(batchId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE employee_issuance_batches
          SET email_sent_at = NOW()
        WHERE id = $1 AND status = 'Pending'`,
      [batchId],
    );
    await client.query(
      `UPDATE employee_issuances
          SET email_sent_at = NOW()
        WHERE batch_id = $1 AND status = 'Pending'`,
      [batchId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function markBatchEmailFailed(batchId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const batchResult = await client.query(
      `SELECT batch.id, batch.employee_id, employee.employee_code
         FROM employee_issuance_batches AS batch
         JOIN employees AS employee ON employee.id = batch.employee_id
        WHERE batch.id = $1 AND batch.status = 'Pending'
        FOR UPDATE OF batch`,
      [batchId],
    );
    const batch = batchResult.rows[0];
    if (!batch) {
      await client.query('COMMIT');
      return;
    }

    const itemsResult = await client.query(
      `SELECT issue.id, issue.employee_id, issue.item_id, employee.employee_code,
              employee.first_name, employee.last_name, inventory.item_code,
              inventory.description
         FROM employee_issuances AS issue
         JOIN employees AS employee ON employee.id = issue.employee_id
         JOIN item_catalog AS inventory ON inventory.id = issue.item_id
        WHERE issue.batch_id = $1 AND issue.status = 'Pending'
        ORDER BY issue.id
        FOR UPDATE OF issue, inventory`,
      [batchId],
    );
    await client.query(
      `UPDATE employee_issuance_batches
          SET status = 'Email Failed',
              decision_note = 'The approval email could not be delivered.',
              decided_at = NOW()
        WHERE id = $1 AND status = 'Pending'`,
      [batchId],
    );
    await client.query(
      `UPDATE employee_issuances
          SET status = 'Email Failed',
              decision_note = 'The approval email could not be delivered.',
              decided_at = NOW()
        WHERE batch_id = $1 AND status = 'Pending'`,
      [batchId],
    );
    const itemIds = itemsResult.rows.map((item) => item.item_id);
    if (itemIds.length > 0) {
      await client.query(
        `UPDATE item_catalog
            SET inventory_status = 'Available'
          WHERE id = ANY($1::BIGINT[]) AND inventory_status = 'Reserved'`,
        [itemIds],
      );
    }
    for (const issuance of itemsResult.rows) {
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
  const batchResult = await pool.query(
    `SELECT batch.status,
            batch.token_expires_at AS "expiresAt",
            batch.requested_at AS "requestedAt",
            employee.first_name || ' ' || employee.last_name AS "employeeName",
            employee.employee_code AS "employeeCode",
            COALESCE(
              json_agg(json_build_object(
                'itemCode', inventory.item_code,
                'itemName', inventory.description,
                'condition', issue.item_condition
              ) ORDER BY issue.id) FILTER (WHERE issue.id IS NOT NULL),
              '[]'::JSON
            ) AS items
       FROM employee_issuance_batches AS batch
       JOIN employees AS employee ON employee.id = batch.employee_id
       LEFT JOIN employee_issuances AS issue ON issue.batch_id = batch.id
       LEFT JOIN item_catalog AS inventory ON inventory.id = issue.item_id
      WHERE batch.token_hash = $1
      GROUP BY batch.id, employee.id`,
    [tokenHash],
  );
  const batch = batchResult.rows[0];
  if (batch) {
    const firstItem = batch.items[0] || {};
    return {
      ...batch,
      itemCode: firstItem.itemCode || '',
      itemName: batch.items.length > 1 ? `${batch.items.length} items` : firstItem.itemName || '',
      condition: batch.items.length > 1 ? 'Multiple' : firstItem.condition || '',
    };
  }

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
    const batchResult = await client.query(
      `SELECT batch.id, batch.status, batch.token_expires_at, employee.id AS employee_id,
              employee.employee_code, employee.first_name, employee.last_name
         FROM employee_issuance_batches AS batch
         JOIN employees AS employee ON employee.id = batch.employee_id
        WHERE batch.token_hash = $1
        FOR UPDATE OF batch`,
      [tokenHash],
    );
    const batch = batchResult.rows[0];
    if (batch) {
      const itemsResult = await client.query(
        `SELECT issue.id, issue.status, issue.employee_id, issue.item_id,
                issue.item_condition, issue.notes, employee.employee_code,
                employee.first_name, employee.last_name, inventory.item_code,
                inventory.description, inventory.inventory_status
           FROM employee_issuances AS issue
           JOIN employees AS employee ON employee.id = issue.employee_id
           JOIN item_catalog AS inventory ON inventory.id = issue.item_id
          WHERE issue.batch_id = $1
          ORDER BY issue.id
          FOR UPDATE OF issue, inventory`,
        [batch.id],
      );
      const items = itemsResult.rows;
      const employeeName = `${batch.first_name} ${batch.last_name}`;
      const itemSummaries = items.map((item) => ({
        itemCode: item.item_code,
        itemName: item.description,
        condition: item.item_condition,
      }));
      const firstItem = itemSummaries[0] || {};

      if (batch.status !== 'Pending') {
        await client.query('COMMIT');
        return {
          alreadyDecided: true,
          status: batch.status,
          employeeName,
          employeeCode: batch.employee_code,
          itemName: itemSummaries.length > 1 ? `${itemSummaries.length} items` : firstItem.itemName,
          itemCode: firstItem.itemCode,
          items: itemSummaries,
        };
      }

      if (new Date(batch.token_expires_at).getTime() <= Date.now()) {
        await client.query(
          `UPDATE employee_issuance_batches
              SET status = 'Expired',
                  decision_note = 'The employee approval link expired.',
                  decided_at = NOW()
            WHERE id = $1 AND status = 'Pending'`,
          [batch.id],
        );
        await client.query(
          `UPDATE employee_issuances
              SET status = 'Expired',
                  decision_note = 'The employee approval link expired.',
                  decided_at = NOW()
            WHERE batch_id = $1 AND status = 'Pending'`,
          [batch.id],
        );
        const itemIds = items.map((item) => item.item_id);
        if (itemIds.length > 0) {
          await client.query(
            `UPDATE item_catalog
                SET inventory_status = 'Available'
              WHERE id = ANY($1::BIGINT[]) AND inventory_status = 'Reserved'`,
            [itemIds],
          );
        }
        for (const item of items) {
          const issuance = {
            employee_id: item.employee_id,
            employee_code: item.employee_code,
            employee_name: `${item.first_name} ${item.last_name}`,
            item_id: item.item_id,
            item_code: item.item_code,
            description: item.description,
          };
          await writeAuditLog(client, issuance, {
            reason: `Employee batch approval link expired for ${item.employee_code}; the item was released.`,
            oldValues: { issuanceStatus: 'Pending', inventoryStatus: 'Reserved' },
            newValues: { issuanceStatus: 'Expired', inventoryStatus: 'Available' },
          });
        }
        await client.query('COMMIT');
        return { expired: true };
      }

      if (items.length === 0 || items.some((item) => item.status !== 'Pending' || item.inventory_status !== 'Reserved')) {
        throw conflict('May item sa issuance batch na hindi na pending o reserved. Makipag-ugnayan sa GSO para ma-check ang request.');
      }

      const nextStatus = action === 'approve' ? 'Issued' : 'Rejected';
      const decisionNote = action === 'approve'
        ? 'Approved by employee using the batch email approval link.'
        : 'Rejected by employee using the batch email approval link.';
      const nextInventoryStatus = action === 'approve' ? 'Issued' : 'Available';
      const itemIds = items.map((item) => item.item_id);

      await client.query(
        `UPDATE employee_issuance_batches
            SET status = $2, decision_note = $3, decided_at = NOW()
          WHERE id = $1 AND status = 'Pending'`,
        [batch.id, nextStatus, decisionNote],
      );
      await client.query(
        `UPDATE employee_issuances
            SET status = $2, decision_note = $3, decided_at = NOW()
          WHERE batch_id = $1 AND status = 'Pending'`,
        [batch.id, nextStatus, decisionNote],
      );
      await client.query(
        `UPDATE item_catalog
            SET inventory_status = $2
          WHERE id = ANY($1::BIGINT[]) AND inventory_status = 'Reserved'`,
        [itemIds, nextInventoryStatus],
      );
      for (const item of items) {
        const issuance = {
          employee_id: item.employee_id,
          employee_code: item.employee_code,
          employee_name: `${item.first_name} ${item.last_name}`,
          item_id: item.item_id,
          item_code: item.item_code,
          description: item.description,
        };
        await writeAuditLog(client, issuance, {
          reason: `${nextStatus} by employee ${item.employee_code} via batch email approval link.`,
          oldValues: { issuanceStatus: 'Pending', inventoryStatus: 'Reserved' },
          newValues: { issuanceStatus: nextStatus, inventoryStatus: nextInventoryStatus },
        });
      }

      await client.query('COMMIT');
      return {
        status: nextStatus,
        employeeName,
        employeeCode: batch.employee_code,
        itemName: itemSummaries.length > 1 ? `${itemSummaries.length} items` : firstItem.itemName,
        itemCode: firstItem.itemCode,
        items: itemSummaries,
      };
    }

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
    const expiredBatches = await client.query(
      `SELECT id
         FROM employee_issuance_batches
        WHERE status = 'Pending'
          AND token_expires_at <= NOW()
        ORDER BY token_expires_at, id
        LIMIT 100
        FOR UPDATE SKIP LOCKED`,
    );
    let expiredBatchItemCount = 0;
    for (const batch of expiredBatches.rows) {
      const itemsResult = await client.query(
        `SELECT issue.id, issue.employee_id, issue.item_id, employee.employee_code,
                employee.first_name, employee.last_name, inventory.item_code,
                inventory.description
           FROM employee_issuances AS issue
           JOIN employees AS employee ON employee.id = issue.employee_id
           JOIN item_catalog AS inventory ON inventory.id = issue.item_id
          WHERE issue.batch_id = $1 AND issue.status = 'Pending'
          ORDER BY issue.id
          FOR UPDATE OF issue, inventory`,
        [batch.id],
      );
      await client.query(
        `UPDATE employee_issuance_batches
            SET status = 'Expired',
                decision_note = 'The employee approval link expired.',
                decided_at = NOW()
          WHERE id = $1 AND status = 'Pending'`,
        [batch.id],
      );
      await client.query(
        `UPDATE employee_issuances
            SET status = 'Expired',
                decision_note = 'The employee approval link expired.',
                decided_at = NOW()
          WHERE batch_id = $1 AND status = 'Pending'`,
        [batch.id],
      );
      const itemIds = itemsResult.rows.map((item) => item.item_id);
      if (itemIds.length > 0) {
        await client.query(
          `UPDATE item_catalog
              SET inventory_status = 'Available'
            WHERE id = ANY($1::BIGINT[]) AND inventory_status = 'Reserved'`,
          [itemIds],
        );
      }
      for (const issuance of itemsResult.rows) {
        await writeAuditLog(client, issuance, {
          reason: `Employee batch approval link expired for ${issuance.employee_code}; the item was released.`,
          oldValues: { issuanceStatus: 'Pending', inventoryStatus: 'Reserved' },
          newValues: { issuanceStatus: 'Expired', inventoryStatus: 'Available' },
        });
      }
      expiredBatchItemCount += itemsResult.rowCount;
    }

    const expiredResult = await client.query(
      `SELECT issue.id, issue.employee_id, issue.item_id, employee.employee_code,
              employee.first_name, employee.last_name, inventory.item_code,
              inventory.description
         FROM employee_issuances AS issue
         JOIN employees AS employee ON employee.id = issue.employee_id
         JOIN item_catalog AS inventory ON inventory.id = issue.item_id
        WHERE issue.status = 'Pending'
          AND issue.batch_id IS NULL
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
    return expiredBatchItemCount + expiredResult.rowCount;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createPendingIssuance,
  createPendingIssuanceBatch,
  markEmailSent,
  markEmailFailed,
  markBatchEmailSent,
  markBatchEmailFailed,
  lookupApproval,
  resolveApproval,
  listEmployeeIssuances,
  expirePendingIssuances,
};
