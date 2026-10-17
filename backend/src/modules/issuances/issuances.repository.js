const pool = require('../../config/db');
const { getAvailableQuantity, refreshInventoryStatus } = require('../inventory/inventory.stock');

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

async function createPendingIssuance({ employeeCode, itemId, quantity, notes, tokenHash, requestedByUserId }) {
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
      `SELECT id, item_code, description, condition, inventory_status, quantity, unit_of_measure
         FROM item_catalog
        WHERE id = $1
        FOR UPDATE`,
      [itemId],
    );
    const item = itemResult.rows[0];
    if (!item) throw notFound('Hindi na makita ang inventory item. I-refresh ang inventory at pumili muli.');
    if (item.inventory_status === 'Borrowed') throw conflict('Hindi available ang item na ito para i-issue muli.');
    const availableQuantity = await getAvailableQuantity(client, item);
    if (availableQuantity < quantity) {
      throw conflict(`Hindi sapat ang available stock. ${item.item_code} ay may ${availableQuantity} ${item.unit_of_measure} na available.`);
    }

    const inserted = await client.query(
      `INSERT INTO employee_issuances (
         employee_id, item_id, requested_by_user_id, status, token_hash,
         token_expires_at, item_condition, notes, quantity, unit_of_measure
       ) VALUES ($1, $2, $3, 'Pending', $4, NOW() + INTERVAL '24 hours', $5, $6, $7, $8)
       RETURNING id, status, token_expires_at AS "expiresAt", requested_at AS "requestedAt"`,
      [employee.id, item.id, requestedByUserId, tokenHash, item.condition, notes, quantity, item.unit_of_measure],
    );
    await refreshInventoryStatus(client, item.id);
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
      quantity,
      unit_of_measure: item.unit_of_measure,
    };

    await writeAuditLog(client, issuance, {
      changedByUserId: requestedByUserId,
      reason: `Issuance request for ${quantity} ${item.unit_of_measure} of ${issuance.description} is awaiting employee email approval.`,
      oldValues: { inventoryStatus: item.inventory_status, availableQuantity },
      newValues: {
        inventoryStatus: quantity === availableQuantity ? 'Reserved' : 'Available',
        reservedQuantity: quantity,
        issuanceStatus: 'Pending',
        employeeCode: employee.employee_code,
        employeeEmail: employee.email,
      },
    });

    await client.query('COMMIT');
    return issuance;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505' && ['employee_issuances_one_active_employee_item_idx', 'employee_issuances_one_active_item_idx'].includes(error.constraint)) {
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
      `SELECT issue.id, issue.employee_id, issue.item_id, issue.quantity, issue.unit_of_measure, inventory.item_code,
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
      await refreshInventoryStatus(client, issuance.item_id);
      await writeAuditLog(client, issuance, {
        reason: `Issuance approval email could not be delivered to ${issuance.employee_code}; ${issuance.quantity} ${issuance.unit_of_measure} were released.`,
        oldValues: { issuanceStatus: 'Pending', quantity: issuance.quantity, unitOfMeasure: issuance.unit_of_measure },
        newValues: { issuanceStatus: 'Email Failed' },
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

async function createPendingIssuanceBatch({ employeeCode, items: requestedItems, notes, tokenHash, requestedByUserId }) {
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
      `SELECT id, item_code, description, condition, inventory_status, quantity, unit_of_measure
         FROM item_catalog
        WHERE id = ANY($1::BIGINT[])
        ORDER BY id
        FOR UPDATE`,
      [requestedItems.map((item) => item.itemId)],
    );
    if (itemResult.rows.length !== requestedItems.length) {
      throw notFound('Hindi na makita ang isa o higit pang inventory item. I-refresh ang inventory at subukan muli.');
    }
    const itemsById = new Map(itemResult.rows.map((item) => [String(item.id), item]));
    const items = requestedItems.map((requested) => ({
      ...itemsById.get(String(requested.itemId)),
      requestedQuantity: requested.quantity,
    }));
    for (const item of items) {
      if (!item.id) throw notFound('Hindi na makita ang isa o higit pang inventory item. I-refresh ang inventory at subukan muli.');
      const availableQuantity = await getAvailableQuantity(client, item);
      if (item.inventory_status === 'Borrowed' || availableQuantity < item.requestedQuantity) {
        throw conflict(`Hindi sapat ang available stock para sa ${item.item_code || 'napiling item'}. ${availableQuantity} ${item.unit_of_measure || 'unit'} na lang ang available.`);
      }
      item.availableQuantityBefore = availableQuantity;
    }

    const batchResult = await client.query(
      `INSERT INTO employee_issuance_batches (
         employee_id, requested_by_user_id, status, token_hash, token_expires_at
       ) VALUES ($1, $2, 'Pending', $3, NOW() + INTERVAL '24 hours')
       RETURNING id, status, token_expires_at AS "expiresAt", requested_at AS "requestedAt"`,
      [employee.id, requestedByUserId, tokenHash],
    );
    const batch = batchResult.rows[0];

    const issuanceItems = [];
    for (const item of items) {
      const inserted = await client.query(
        `INSERT INTO employee_issuances (
           batch_id, employee_id, item_id, requested_by_user_id, status, token_hash,
           token_expires_at, item_condition, notes, quantity, unit_of_measure
         ) VALUES ($1, $2, $3, $4, 'Pending', NULL, $5, $6, $7, $8, $9)
         RETURNING id`,
        [batch.id, employee.id, item.id, requestedByUserId, batch.expiresAt, item.condition, notes, item.requestedQuantity, item.unit_of_measure],
      );
      await refreshInventoryStatus(client, item.id);
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
        quantity: item.requestedQuantity,
        unit_of_measure: item.unit_of_measure,
      };
      issuanceItems.push({
        id: issuance.id,
        itemId: item.id,
        itemCode: item.item_code,
        itemName: item.description,
        condition: item.condition,
        quantity: item.requestedQuantity,
        unitOfMeasure: item.unit_of_measure,
        availableQuantity: item.availableQuantityBefore - item.requestedQuantity,
      });

      await writeAuditLog(client, issuance, {
        changedByUserId: requestedByUserId,
        reason: `Issuance request for ${item.requestedQuantity} ${item.unit_of_measure} of ${issuance.description} is awaiting employee batch email approval.`,
        oldValues: { inventoryStatus: item.inventory_status, availableQuantity: item.availableQuantityBefore },
        newValues: {
          inventoryStatus: item.requestedQuantity === item.availableQuantityBefore ? 'Reserved' : 'Available',
          reservedQuantity: item.requestedQuantity,
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
    if (error.code === '23505' && ['employee_issuances_one_active_employee_item_idx', 'employee_issuances_one_active_item_idx'].includes(error.constraint)) {
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
      `SELECT issue.id, issue.employee_id, issue.item_id, issue.quantity, issue.unit_of_measure, employee.employee_code,
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
    for (const itemId of new Set(itemIds.map(String))) await refreshInventoryStatus(client, itemId);
    for (const issuance of itemsResult.rows) {
      await writeAuditLog(client, issuance, {
        reason: `Issuance approval email could not be delivered to ${issuance.employee_code}; ${issuance.quantity} ${issuance.unit_of_measure} were released.`,
        oldValues: { issuanceStatus: 'Pending', quantity: issuance.quantity, unitOfMeasure: issuance.unit_of_measure },
        newValues: { issuanceStatus: 'Email Failed' },
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
                'condition', issue.item_condition,
                'quantity', issue.quantity,
                'unitOfMeasure', issue.unit_of_measure
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
            issue.quantity,
            issue.unit_of_measure AS "unitOfMeasure",
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
        `SELECT issue.id, issue.status, issue.employee_id, issue.item_id, issue.quantity, issue.unit_of_measure,
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
        quantity: item.quantity,
        unitOfMeasure: item.unit_of_measure,
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
        for (const itemId of new Set(itemIds.map(String))) await refreshInventoryStatus(client, itemId);
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
            reason: `Employee batch approval link expired for ${item.employee_code}; ${item.quantity} ${item.unit_of_measure} were released.`,
            oldValues: { issuanceStatus: 'Pending', quantity: item.quantity, unitOfMeasure: item.unit_of_measure },
            newValues: { issuanceStatus: 'Expired' },
          });
        }
        await client.query('COMMIT');
        return { expired: true };
      }

      if (items.length === 0 || items.some((item) => item.status !== 'Pending')) {
        throw conflict('May item sa issuance batch na hindi na pending. Makipag-ugnayan sa GSO para ma-check ang request.');
      }

      const nextStatus = action === 'approve' ? 'Issued' : 'Rejected';
      const decisionNote = action === 'approve'
        ? 'Approved by employee using the batch email approval link.'
        : 'Rejected by employee using the batch email approval link.';
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
      const inventoryStatuses = new Map();
      for (const itemId of new Set(itemIds.map(String))) {
        inventoryStatuses.set(itemId, await refreshInventoryStatus(client, itemId));
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
          reason: `${nextStatus} by employee ${item.employee_code} via batch email approval link for ${item.quantity} ${item.unit_of_measure}.`,
          oldValues: { issuanceStatus: 'Pending', quantity: item.quantity, unitOfMeasure: item.unit_of_measure },
          newValues: { issuanceStatus: nextStatus, inventoryStatus: inventoryStatuses.get(String(item.item_id)) },
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
              issue.item_id, issue.item_condition, issue.notes, issue.quantity, issue.unit_of_measure, employee.employee_code,
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
      quantity: row.quantity,
      unit_of_measure: row.unit_of_measure,
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
      await refreshInventoryStatus(client, row.item_id);
      await writeAuditLog(client, issuance, {
        reason: `Employee approval link expired for ${row.employee_code}; ${row.quantity} ${row.unit_of_measure} were released.`,
        oldValues: { issuanceStatus: 'Pending', quantity: row.quantity, unitOfMeasure: row.unit_of_measure },
        newValues: { issuanceStatus: 'Expired' },
      });
      await client.query('COMMIT');
      return { expired: true };
    }

    const nextStatus = action === 'approve' ? 'Issued' : 'Rejected';
    const decisionNote = action === 'approve'
      ? 'Approved by employee using the email approval link.'
      : 'Rejected by employee using the email approval link.';
    await client.query(
      `UPDATE employee_issuances
          SET status = $2, decision_note = $3, decided_at = NOW()
        WHERE id = $1 AND status = 'Pending'`,
      [row.id, nextStatus, decisionNote],
    );
    const inventoryStatus = await refreshInventoryStatus(client, row.item_id);
    await writeAuditLog(client, issuance, {
      reason: `${nextStatus} by employee ${row.employee_code} via emailed approval link for ${row.quantity} ${row.unit_of_measure}.`,
      oldValues: { issuanceStatus: 'Pending', quantity: row.quantity, unitOfMeasure: row.unit_of_measure },
      newValues: { issuanceStatus: nextStatus, inventoryStatus },
    });

    await client.query('COMMIT');
    return {
      status: nextStatus,
      employeeName: issuance.employee_name,
      employeeCode: row.employee_code,
      itemName: row.description,
      itemCode: row.item_code,
      quantity: row.quantity,
      unitOfMeasure: row.unit_of_measure,
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
      `SELECT issue.id::TEXT AS id,
              inventory.item_code AS code,
              inventory.description AS name,
              issue.item_condition AS condition,
              issue.quantity - issue.returned_quantity AS quantity,
              issue.unit_of_measure AS "unitOfMeasure",
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
              history.quantity,
              history."unitOfMeasure",
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
                  issue.quantity,
                  issue.unit_of_measure AS "unitOfMeasure",
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
                  return_request.quantity,
                  issue.unit_of_measure AS "unitOfMeasure",
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
        `SELECT issue.id, issue.employee_id, issue.item_id, issue.quantity, issue.unit_of_measure, employee.employee_code,
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
      for (const itemId of new Set(itemIds.map(String))) await refreshInventoryStatus(client, itemId);
      for (const issuance of itemsResult.rows) {
        await writeAuditLog(client, issuance, {
          reason: `Employee batch approval link expired for ${issuance.employee_code}; ${issuance.quantity} ${issuance.unit_of_measure} were released.`,
          oldValues: { issuanceStatus: 'Pending', quantity: issuance.quantity, unitOfMeasure: issuance.unit_of_measure },
          newValues: { issuanceStatus: 'Expired' },
        });
      }
      expiredBatchItemCount += itemsResult.rowCount;
    }

    const expiredResult = await client.query(
      `SELECT issue.id, issue.employee_id, issue.item_id, issue.quantity, issue.unit_of_measure, employee.employee_code,
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
      await refreshInventoryStatus(client, issuance.item_id);
      await writeAuditLog(client, issuance, {
        reason: `Employee approval link expired for ${issuance.employee_code}; ${issuance.quantity} ${issuance.unit_of_measure} were released.`,
        oldValues: { issuanceStatus: 'Pending', quantity: issuance.quantity, unitOfMeasure: issuance.unit_of_measure },
        newValues: { issuanceStatus: 'Expired' },
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
