const pool = require('../../config/db');
const { refreshInventoryStatus } = require('../inventory/inventory.stock');

async function syncUnitTags(client, { item, fromEmployeeId, toEmployeeId, toLocation, quantity, issuanceId }) {
  const total = await client.query('SELECT COUNT(*)::INTEGER AS count FROM asset_unit_tags WHERE item_id = $1', [item.id]);
  const tagCount = Number(total.rows[0]?.count || 0);
  if (!tagCount) return;
  if (tagCount < Number(item.quantity)) throw Object.assign(new Error('May unit tags ang item pero hindi pa lahat ng quantity ay natag. Kumpletuhin muna ang tags bago maglipat ng custody.'), { status: 409 });
  const units = await client.query(
    `SELECT id FROM asset_unit_tags
      WHERE item_id = $1 AND custody_status = 'Issued' AND assigned_employee_id = $2 AND lifecycle_status <> 'Disposed'
      ORDER BY unit_number LIMIT $3 FOR UPDATE`, [item.id, fromEmployeeId, quantity]);
  if (units.rowCount < quantity) throw Object.assign(new Error(`Hindi ma-match ang movement sa unique tags ng source employee. Tagged units available: ${units.rowCount}.`), { status: 409 });
  if (toEmployeeId) {
    await client.query(
      `UPDATE asset_unit_tags SET assigned_employee_id = $2, issuance_id = $3, updated_at = NOW()
        WHERE id = ANY($1::BIGINT[])`, [units.rows.map((unit) => unit.id), toEmployeeId, issuanceId]);
  } else {
    await client.query(
      `UPDATE asset_unit_tags SET custody_status = 'Available', assigned_employee_id = NULL,
              issuance_id = NULL, location = $2, updated_at = NOW()
        WHERE id = ANY($1::BIGINT[])`, [units.rows.map((unit) => unit.id), toLocation]);
  }
}

async function listMovements() {
  const result = await pool.query(`
    SELECT movement.id, movement.item_id AS "itemId", item.item_code AS "itemCode",
           COALESCE(NULLIF(item.item_name, ''), item.description) AS "itemName", movement.movement_type AS "movementType",
           movement.quantity, source.employee_code AS "fromEmployeeCode",
           source.first_name || ' ' || source.last_name AS "fromEmployee", movement.from_location AS "fromLocation",
           destination.employee_code AS "toEmployeeCode", destination.first_name || ' ' || destination.last_name AS "toEmployee",
           movement.to_location AS "toLocation", movement.reason,
           movement.recipient_acknowledgement AS acknowledgement, movement.created_at AS "createdAt", actor.name AS "recordedBy"
      FROM asset_movements AS movement JOIN item_catalog AS item ON item.id = movement.item_id
      LEFT JOIN employees AS source ON source.id = movement.from_employee_id
      LEFT JOIN employees AS destination ON destination.id = movement.to_employee_id
      LEFT JOIN users AS actor ON actor.id = movement.recorded_by_user_id
     ORDER BY movement.created_at DESC, movement.id DESC LIMIT 500`);
  return result.rows;
}

async function createMovement(input, actorId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const itemResult = await client.query('SELECT * FROM item_catalog WHERE id = $1 FOR UPDATE', [input.itemId]);
    const item = itemResult.rows[0];
    if (!item) throw Object.assign(new Error('Hindi makita ang item.'), { status: 404 });
    if (item.lifecycle_status !== 'Active') throw Object.assign(new Error('Active inventory records lamang ang maaaring ilipat.'), { status: 409 });

    const fromResult = input.fromEmployeeCode
      ? await client.query('SELECT id, employee_code, status FROM employees WHERE lower(employee_code) = lower($1) FOR UPDATE', [input.fromEmployeeCode])
      : { rows: [] };
    const toResult = input.toEmployeeCode
      ? await client.query('SELECT id, employee_code, status FROM employees WHERE lower(employee_code) = lower($1) FOR UPDATE', [input.toEmployeeCode])
      : { rows: [] };
    const fromEmployee = fromResult.rows[0];
    const toEmployee = toResult.rows[0];
    if (input.fromEmployeeCode && !fromEmployee) throw Object.assign(new Error('Hindi makita ang source employee.'), { status: 404 });
    if (input.toEmployeeCode && !toEmployee) throw Object.assign(new Error('Hindi makita ang recipient employee.'), { status: 404 });
    if (toEmployee && toEmployee.status !== 'Active') throw Object.assign(new Error('Hindi maaaring tumanggap ng asset ang inactive employee.'), { status: 409 });
    if (fromEmployee && toEmployee && fromEmployee.id === toEmployee.id) throw Object.assign(new Error('Magkaibang employee ang source at recipient.'), { status: 400 });

    if (input.movementType === 'LOCATION_CHANGE') {
      if (input.fromLocation.toLowerCase() !== item.location.trim().toLowerCase()) {
        throw Object.assign(new Error(`Ang kasalukuyang catalog location ay ${item.location}. I-refresh muna ang listahan.`), { status: 409 });
      }
      const active = await client.query(
        `SELECT COALESCE(SUM(quantity - returned_quantity), 0)::INTEGER AS quantity
           FROM employee_issuances WHERE item_id = $1 AND status = 'Issued'`, [input.itemId]);
      const activeBorrowings = await client.query(
        `SELECT COALESCE(SUM(asset.quantity), 0)::INTEGER AS quantity
           FROM service_request_assets AS asset JOIN service_requests AS request ON request.id = asset.request_id
          WHERE asset.item_id = $1 AND request.status IN ('Approved', 'Ready for Pickup', 'Issued', 'Return Requested', 'For Repair')`, [input.itemId]);
      if (input.quantity !== Number(item.quantity) || Number(active.rows[0]?.quantity || 0) > 0 || Number(activeBorrowings.rows[0]?.quantity || 0) > 0) {
        throw Object.assign(new Error('Buong catalog quantity lamang ang maaaring ilipat sa ibang stockroom; ilipat muna ang mga naka-issue na unit.'), { status: 409 });
      }
      await client.query('UPDATE item_catalog SET location = $2 WHERE id = $1', [input.itemId, input.toLocation]);
      await client.query('UPDATE asset_unit_tags SET location = $2, updated_at = NOW() WHERE item_id = $1 AND lifecycle_status <> \'Disposed\'', [input.itemId, input.toLocation]);
    } else if (fromEmployee) {
      const pendingReturns = await client.query(
        `SELECT COUNT(*)::INTEGER AS count
           FROM employee_issuance_returns AS return_request
           JOIN employee_issuances AS issue ON issue.id = return_request.issuance_id
          WHERE issue.item_id = $1 AND issue.employee_id = $2 AND return_request.status = 'Pending'`,
        [input.itemId, fromEmployee.id]);
      if (Number(pendingReturns.rows[0]?.count || 0) > 0) {
        throw Object.assign(new Error('May pending return approval pa ang source employee. Kumpletuhin o tanggihan muna iyon bago mag-transfer.'), { status: 409 });
      }
      const issueResult = await client.query(
        `SELECT id, quantity, returned_quantity
           FROM employee_issuances
          WHERE item_id = $1 AND employee_id = $2 AND status = 'Issued' AND returned_quantity < quantity
          ORDER BY decided_at, id FOR UPDATE`, [input.itemId, fromEmployee.id]);
      const available = issueResult.rows.reduce((total, issue) => total + Number(issue.quantity) - Number(issue.returned_quantity), 0);
      if (input.quantity > available) throw Object.assign(new Error(`Hindi sapat ang active assigned quantity. Available: ${available}.`), { status: 409 });
      let remaining = input.quantity;
      for (const issue of issueResult.rows) {
        if (!remaining) break;
        const outstanding = Number(issue.quantity) - Number(issue.returned_quantity);
        const take = Math.min(outstanding, remaining);
        await client.query(
          `UPDATE employee_issuances
              SET returned_quantity = returned_quantity + $2,
                  status = CASE WHEN returned_quantity + $2 >= quantity THEN 'Returned' ELSE status END
            WHERE id = $1`, [issue.id, take]);
        remaining -= take;
      }
      if (toEmployee) {
        const destinationIssuance = await client.query(
          `INSERT INTO employee_issuances (
             employee_id, item_id, requested_by_user_id, status, token_expires_at,
             item_condition, notes, requested_at, decided_at, quantity, unit_of_measure, returned_quantity
           ) VALUES ($1, $2, $3, 'Issued', NOW() + INTERVAL '30 days', $4, $5, NOW(), NOW(), $6, $7, 0) RETURNING id`,
          [toEmployee.id, input.itemId, actorId, item.condition,
            `Asset ${input.movementType.toLowerCase()}; acknowledgement: ${input.acknowledgement}`, input.quantity, item.unit_of_measure]);
        await syncUnitTags(client, { item, fromEmployeeId: fromEmployee.id, toEmployeeId: toEmployee.id, quantity: input.quantity, issuanceId: destinationIssuance.rows[0].id });
      } else {
        await syncUnitTags(client, { item, fromEmployeeId: fromEmployee.id, toLocation: input.toLocation, quantity: input.quantity });
        if (input.movementType === 'TURNOVER' && input.quantity === Number(item.quantity)) {
          await client.query('UPDATE item_catalog SET location = $2 WHERE id = $1', [input.itemId, input.toLocation]);
        }
      }
    } else {
      if (input.fromLocation.toLowerCase() !== item.location.trim().toLowerCase()) {
        throw Object.assign(new Error(`Ang kasalukuyang catalog location ay ${item.location}. I-refresh muna ang listahan.`), { status: 409 });
      }
      const active = await client.query(
        `SELECT COALESCE(SUM(issue.quantity) FILTER (WHERE issue.status = 'Pending'), 0)
              + COALESCE(SUM(issue.quantity - issue.returned_quantity) FILTER (WHERE issue.status = 'Issued'), 0)
              + COALESCE((SELECT SUM(asset.quantity) FROM service_request_assets AS asset
                           JOIN service_requests AS request ON request.id = asset.request_id
                          WHERE asset.item_id = $1 AND request.status IN ('Approved', 'Ready for Pickup', 'Issued', 'Return Requested', 'For Repair')), 0) AS quantity
           FROM employee_issuances AS issue WHERE issue.item_id = $1 AND issue.status IN ('Pending', 'Issued')`, [input.itemId]);
      const available = Math.max(0, Number(item.quantity) - Number(active.rows[0]?.quantity || 0));
      if (input.quantity > available) throw Object.assign(new Error(`Hindi sapat ang available stock sa location. Available: ${available}.`), { status: 409 });
      if (toEmployee) {
        const destinationIssuance = await client.query(
          `INSERT INTO employee_issuances (
             employee_id, item_id, requested_by_user_id, status, token_expires_at,
             item_condition, notes, requested_at, decided_at, quantity, unit_of_measure, returned_quantity
           ) VALUES ($1, $2, $3, 'Issued', NOW() + INTERVAL '30 days', $4, $5, NOW(), NOW(), $6, $7, 0) RETURNING id`,
          [toEmployee.id, input.itemId, actorId, item.condition,
            `Stock issuance by recorded transfer; acknowledgement: ${input.acknowledgement}`, input.quantity, item.unit_of_measure]);
        const tagCount = await client.query('SELECT COUNT(*)::INTEGER AS count FROM asset_unit_tags WHERE item_id = $1', [item.id]);
        if (Number(tagCount.rows[0]?.count || 0)) {
          const availableTags = await client.query(
            `SELECT id FROM asset_unit_tags WHERE item_id = $1 AND custody_status = 'Available' AND lifecycle_status = 'Active'
              ORDER BY unit_number LIMIT $2 FOR UPDATE`, [item.id, input.quantity]);
          if (availableTags.rowCount < input.quantity) throw Object.assign(new Error('Hindi sapat ang mga available unique asset tags para sa issuance.'), { status: 409 });
          await client.query(
            `UPDATE asset_unit_tags SET custody_status = 'Issued', assigned_employee_id = $2, issuance_id = $3,
                    location = $4, updated_at = NOW() WHERE id = ANY($1::BIGINT[])`,
            [availableTags.rows.map((tag) => tag.id), toEmployee.id, destinationIssuance.rows[0].id, input.fromLocation]);
        }
      }
    }

    const inserted = await client.query(
      `INSERT INTO asset_movements (
         item_id, movement_type, quantity, from_employee_id, to_employee_id, from_location, to_location,
         reason, recipient_acknowledgement, recorded_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), NULLIF($7, ''), $8, $9, $10) RETURNING id`,
      [input.itemId, input.movementType, input.quantity, fromEmployee?.id || null, toEmployee?.id || null,
        input.fromLocation || null, input.toLocation || null, input.reason, input.acknowledgement, actorId]);
    await client.query(
      `INSERT INTO inventory_change_logs (entity_type, entity_key, entity_name, item_id, action, reason, old_values, new_values, changed_by_user_id)
       VALUES ('item', $1, $2, $3, $4, $5, $6::JSONB, $7::JSONB, $8)`,
      [String(item.id), item.item_name || item.description, item.id, input.movementType.toLowerCase(), input.reason,
        JSON.stringify({ fromEmployee: fromEmployee?.employee_code || null, fromLocation: input.fromLocation || null }),
        JSON.stringify({ toEmployee: toEmployee?.employee_code || null, toLocation: input.toLocation || null, quantity: input.quantity, acknowledgement: input.acknowledgement }), actorId]);
    await refreshInventoryStatus(client, input.itemId);
    await client.query('COMMIT');
    return inserted.rows[0].id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { listMovements, createMovement };
