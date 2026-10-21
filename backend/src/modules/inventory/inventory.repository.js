const pool = require('../../config/db');

const itemColumns = `
  i.id,
  i.item_code AS "itemCode",
  i.category,
  i.item_name AS "itemName",
  i.description,
  to_char(i.date_acquired, 'YYYY-MM-DD') AS "dateAcquired",
  to_char(i.time_acquired, 'HH24:MI') AS "timeAcquired",
  i.unit_cost AS "unitCost",
  i.acquisition_cost AS "acquisitionCost",
  i.current_value AS "currentValue",
  i.quantity,
  GREATEST(i.quantity - COALESCE(stock_usage.active_quantity, 0), 0)::INTEGER AS "availableQuantity",
  i.unit_of_measure AS "unitOfMeasure",
  i.condition,
  CASE
    WHEN i.inventory_status = 'Borrowed' AND COALESCE(stock_usage.active_quantity, 0) = 0 THEN 'Borrowed'
    WHEN i.quantity > COALESCE(stock_usage.active_quantity, 0) THEN 'Available'
    WHEN COALESCE(stock_usage.pending_quantity, 0) > 0 THEN 'Pending Approval'
    WHEN COALESCE(stock_usage.issued_quantity, 0) > 0 THEN 'Issued'
    ELSE i.inventory_status
  END AS status,
  i.created_at AS "createdAt",
  creator.name AS "createdBy",
  CASE
    WHEN COALESCE(stock_usage.active_employee_count, 0) > 1 THEN 'Multiple employees'
    ELSE assignee.first_name || ' ' || assignee.last_name
  END AS "assignedTo",
  to_char(current_issuance.decided_at, 'Mon DD, YYYY') AS "dateIssued",
  to_char(current_issuance.decided_at, 'HH12:MI AM') AS "timeIssued",
  COALESCE((
    SELECT json_agg(json_build_object(
      'action', history.action,
      'reason', history.reason,
      'oldValues', history.old_values,
      'newValues', history.new_values,
      'changedAt', history.changed_at,
      'changedBy', history.changed_by
    ) ORDER BY history.changed_at DESC, history.sort_id DESC)
      FROM (
        SELECT change.action,
               change.reason,
               change.old_values,
               change.new_values,
               change.changed_at,
               editor.name AS changed_by,
               change.id AS sort_id
          FROM inventory_change_logs AS change
          LEFT JOIN users AS editor ON editor.id = change.changed_by_user_id
         WHERE change.entity_type = 'item'
           AND change.item_id = i.id
           AND change.action = 'updated'
           AND (change.old_values ? 'itemCode' OR change.new_values ? 'itemCode')

        UNION ALL

        SELECT 'issued'::TEXT AS action,
               'Issued to ' || employee.first_name || ' ' || employee.last_name || ' (' || employee.employee_code || ').' AS reason,
               '{}'::JSONB AS old_values,
               jsonb_build_object(
                 'employeeCode', employee.employee_code,
                 'employeeName', employee.first_name || ' ' || employee.last_name,
                 'condition', issue.item_condition
               ) AS new_values,
               issue.decided_at AS changed_at,
               employee.first_name || ' ' || employee.last_name AS changed_by,
               issue.id AS sort_id
          FROM employee_issuances AS issue
          JOIN employees AS employee ON employee.id = issue.employee_id
         WHERE issue.item_id = i.id
           AND issue.status IN ('Issued', 'Returned')
           AND issue.decided_at IS NOT NULL

        UNION ALL

        SELECT 'returned'::TEXT AS action,
               'Returned by ' || employee.first_name || ' ' || employee.last_name || ' (' || employee.employee_code || ').' AS reason,
               jsonb_build_object('inventoryStatus', 'Issued') AS old_values,
               jsonb_build_object(
                 'inventoryStatus', 'Available',
                 'condition', return_request.return_condition
               ) AS new_values,
               return_request.decided_at AS changed_at,
               employee.first_name || ' ' || employee.last_name AS changed_by,
               return_request.id AS sort_id
          FROM employee_issuance_returns AS return_request
          JOIN employee_issuances AS issue ON issue.id = return_request.issuance_id
          JOIN employees AS employee ON employee.id = issue.employee_id
         WHERE issue.item_id = i.id
           AND return_request.status = 'Returned'
           AND return_request.decided_at IS NOT NULL

        UNION ALL

        SELECT 'employee_profile_updated'::TEXT AS action,
               'Profile update for ' || employee.first_name || ' ' || employee.last_name || ' (' || employee.employee_code || '): ' || change.reason AS reason,
               change.old_values,
               change.new_values,
               change.changed_at,
               editor.name AS changed_by,
               change.id AS sort_id
          FROM inventory_change_logs AS change
          JOIN employees AS employee ON employee.id = change.employee_id
          LEFT JOIN users AS editor ON editor.id = change.changed_by_user_id
         WHERE change.entity_type = 'employee'
           AND change.action = 'updated'
           AND EXISTS (
             SELECT 1
               FROM employee_issuances AS issue
              WHERE issue.item_id = i.id
                AND issue.employee_id = employee.id
                AND issue.status IN ('Issued', 'Returned')
           )
      ) AS history
  ), '[]'::JSON) AS "changeHistory"
`;

async function listItems() {
  const result = await pool.query(
    `SELECT ${itemColumns}
       FROM item_catalog AS i
       LEFT JOIN users AS creator ON creator.id = i.created_by_user_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(issue.quantity) FILTER (WHERE issue.status = 'Pending'), 0)::INTEGER AS pending_quantity,
                COALESCE(SUM(issue.quantity - issue.returned_quantity) FILTER (WHERE issue.status = 'Issued'), 0)::INTEGER AS issued_quantity,
                (COALESCE(SUM(issue.quantity) FILTER (WHERE issue.status = 'Pending'), 0)
                  + COALESCE(SUM(issue.quantity - issue.returned_quantity) FILTER (WHERE issue.status = 'Issued'), 0))::INTEGER AS active_quantity,
                COUNT(DISTINCT issue.employee_id) FILTER (WHERE issue.status IN ('Pending', 'Issued'))::INTEGER AS active_employee_count
           FROM employee_issuances AS issue
          WHERE issue.item_id = i.id
            AND issue.status IN ('Pending', 'Issued')
       ) AS stock_usage ON TRUE
       LEFT JOIN LATERAL (
         SELECT issue.employee_id, issue.decided_at, issue.status
           FROM employee_issuances AS issue
          WHERE issue.item_id = i.id
            AND issue.status IN ('Pending', 'Issued')
          ORDER BY issue.requested_at DESC, issue.id DESC
          LIMIT 1
       ) AS current_issuance ON TRUE
       LEFT JOIN employees AS assignee ON assignee.id = current_issuance.employee_id
      ORDER BY i.created_at DESC, i.id DESC`,
  );
  return result.rows;
}

async function getItemById(queryable, id) {
  const result = await queryable.query(
    `SELECT ${itemColumns}
       FROM item_catalog AS i
       LEFT JOIN users AS creator ON creator.id = i.created_by_user_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(issue.quantity) FILTER (WHERE issue.status = 'Pending'), 0)::INTEGER AS pending_quantity,
                COALESCE(SUM(issue.quantity - issue.returned_quantity) FILTER (WHERE issue.status = 'Issued'), 0)::INTEGER AS issued_quantity,
                (COALESCE(SUM(issue.quantity) FILTER (WHERE issue.status = 'Pending'), 0)
                  + COALESCE(SUM(issue.quantity - issue.returned_quantity) FILTER (WHERE issue.status = 'Issued'), 0))::INTEGER AS active_quantity,
                COUNT(DISTINCT issue.employee_id) FILTER (WHERE issue.status IN ('Pending', 'Issued'))::INTEGER AS active_employee_count
           FROM employee_issuances AS issue
          WHERE issue.item_id = i.id
            AND issue.status IN ('Pending', 'Issued')
       ) AS stock_usage ON TRUE
       LEFT JOIN LATERAL (
         SELECT issue.employee_id, issue.decided_at, issue.status
           FROM employee_issuances AS issue
          WHERE issue.item_id = i.id
            AND issue.status IN ('Pending', 'Issued')
          ORDER BY issue.requested_at DESC, issue.id DESC
          LIMIT 1
       ) AS current_issuance ON TRUE
       LEFT JOIN employees AS assignee ON assignee.id = current_issuance.employee_id
      WHERE i.id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

async function createItem({
  itemCode,
  category,
  itemName,
  description,
  dateAcquired,
  timeAcquired,
  unitCost,
  acquisitionCost,
  currentValue,
  quantity,
  unitOfMeasure,
  condition,
  createdByUserId,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO item_catalog (
         item_code, category_id, category, item_name, description, date_acquired, time_acquired,
         unit_cost, acquisition_cost, current_value, quantity, unit_of_measure,
         condition, created_by_user_id
       )
       SELECT $1, category_row.id, category_row.name, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
         FROM item_categories AS category_row
        WHERE lower(category_row.name) = lower($2)
       RETURNING id`,
      [
        itemCode,
        category,
        itemName,
        description,
        dateAcquired,
        timeAcquired,
        unitCost,
        acquisitionCost,
        currentValue,
        quantity,
        unitOfMeasure,
        condition,
        createdByUserId,
      ],
    );

    if (!result.rows[0]) {
      throw Object.assign(new Error('Hindi na makita ang piniling category. I-refresh ang page at pumili muli.'), {
        code: 'CATEGORY_NOT_FOUND',
      });
    }

    const id = result.rows[0].id;
    const created = await getItemById(client, id);
    await client.query(
      `INSERT INTO inventory_change_logs (
         entity_type, entity_key, entity_name, item_id, action, reason,
         old_values, new_values, changed_by_user_id
       ) VALUES ('item', $1, $2, $3, 'created', 'New inventory item created.', '{}'::JSONB, $4::JSONB, $5)`,
      [String(id), created.itemName, id, JSON.stringify({
        itemCode: created.itemCode,
        category: created.category,
        itemName: created.itemName,
        description: created.description,
        dateAcquired: created.dateAcquired,
        timeAcquired: created.timeAcquired,
        unitCost: created.unitCost,
        acquisitionCost: created.acquisitionCost,
        currentValue: created.currentValue,
        quantity: created.quantity,
        unitOfMeasure: created.unitOfMeasure,
        condition: created.condition,
      }), createdByUserId],
    );
    const itemWithHistory = await getItemById(client, id);
    await client.query('COMMIT');
    return itemWithHistory;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function itemSnapshot(item) {
  return {
    itemCode: item.item_code,
    category: item.category,
    itemName: item.item_name,
    description: item.description,
    dateAcquired: item.date_acquired,
    timeAcquired: item.time_acquired,
    unitCost: item.unit_cost,
    acquisitionCost: item.acquisition_cost,
    currentValue: item.current_value,
    quantity: item.quantity,
    unitOfMeasure: item.unit_of_measure,
    condition: item.condition,
  };
}

async function updateItem(id, item, { changedByUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const previousResult = await client.query(
      'SELECT * FROM item_catalog WHERE id = $1 FOR UPDATE',
      [id],
    );
    const previous = previousResult.rows[0];
    if (!previous) {
      throw Object.assign(new Error('Hindi na makita ang item na ie-edit.'), { status: 404 });
    }

    const activeIssuanceQuantityResult = await client.query(
      `SELECT COALESCE(SUM(quantity) FILTER (WHERE status = 'Pending'), 0)
              + COALESCE(SUM(quantity - returned_quantity) FILTER (WHERE status = 'Issued'), 0) AS quantity
         FROM employee_issuances
        WHERE item_id = $1
          AND status IN ('Pending', 'Issued')`,
      [id],
    );
    const activeIssuanceQuantity = Number(activeIssuanceQuantityResult.rows[0]?.quantity || 0);
    if (item.quantity < activeIssuanceQuantity) {
      throw Object.assign(new Error(`Quantity cannot be lower than ${activeIssuanceQuantity} units currently pending or issued.`), { status: 409 });
    }

    const costOrQuantityChanged = Number(previous.unit_cost) !== item.unitCost
      || Number(previous.quantity) !== item.quantity;
    const calculatedAcquisitionCost = Math.round((item.unitCost * item.quantity + Number.EPSILON) * 100) / 100;
    if (!Number.isFinite(calculatedAcquisitionCost) || calculatedAcquisitionCost > 9999999999.99) {
      throw Object.assign(new Error('Acquisition cost ay lampas sa pinapayagang halaga.'), { status: 400 });
    }
    const acquisitionCost = costOrQuantityChanged
      ? calculatedAcquisitionCost
      : Number(previous.acquisition_cost);
    const previousCurrentValue = previous.current_value === null ? null : Number(previous.current_value);
    const currentValueChanged = previousCurrentValue !== item.currentValue;
    if ((costOrQuantityChanged || currentValueChanged) && item.currentValue !== null && item.currentValue > acquisitionCost) {
      throw Object.assign(new Error('Current assessed value cannot exceed the calculated acquisition cost.'), { status: 400 });
    }

    const updateResult = await client.query(
      `UPDATE item_catalog AS inventory_item
          SET item_code = $2,
              category_id = category_row.id,
              category = category_row.name,
              item_name = $4,
              description = $5,
              date_acquired = $6,
              time_acquired = $7,
              unit_cost = $8,
              acquisition_cost = $9,
              current_value = $10,
              quantity = $11,
              unit_of_measure = $12,
              condition = $13
         FROM item_categories AS category_row
        WHERE inventory_item.id = $1
          AND lower(category_row.name) = lower($3)
       RETURNING inventory_item.id`,
      [
        id,
        item.itemCode,
        item.category,
        item.itemName,
        item.description,
        item.dateAcquired,
        item.timeAcquired,
        item.unitCost,
        acquisitionCost,
        item.currentValue,
        item.quantity,
        item.unitOfMeasure,
        item.condition,
      ],
    );
    if (!updateResult.rows[0]) {
      throw Object.assign(new Error('Hindi na makita ang piniling category. I-refresh ang page at pumili muli.'), {
        code: 'CATEGORY_NOT_FOUND',
      });
    }

    const updated = await getItemById(client, id);
    await client.query(
      `INSERT INTO inventory_change_logs (
         entity_type, entity_key, entity_name, item_id, action, reason,
         old_values, new_values, changed_by_user_id
       ) VALUES ('item', $1, $2, $3, 'updated', $4, $5::JSONB, $6::JSONB, $7)`,
      [
        String(id),
        updated.itemName,
        id,
        item.reason,
        JSON.stringify(itemSnapshot(previous)),
        JSON.stringify({
          itemCode: updated.itemCode,
          category: updated.category,
          itemName: updated.itemName,
          description: updated.description,
          dateAcquired: updated.dateAcquired,
          timeAcquired: updated.timeAcquired,
          unitCost: updated.unitCost,
          acquisitionCost: updated.acquisitionCost,
          currentValue: updated.currentValue,
          quantity: updated.quantity,
          unitOfMeasure: updated.unitOfMeasure,
          condition: updated.condition,
        }),
        changedByUserId,
      ],
    );

    const itemWithHistory = await getItemById(client, id);
    await client.query('COMMIT');
    return itemWithHistory;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listCategories() {
  const result = await pool.query(
    `SELECT id, name
       FROM item_categories
      ORDER BY lower(name), id`,
  );
  return result.rows;
}

async function createCategory({ name, createdByUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO item_categories (name, created_by_user_id)
       VALUES ($1, $2)
       RETURNING id, name`,
      [name, createdByUserId],
    );
    const category = result.rows[0];
    await client.query(
      `INSERT INTO inventory_change_logs (
         entity_type, entity_key, entity_name, category_id, action, reason,
         old_values, new_values, changed_by_user_id
       ) VALUES ('category', $1, $2, $3, 'created', 'Inventory category created.', '{}'::JSONB, $4::JSONB, $5)`,
      [String(category.id), category.name, category.id, JSON.stringify({ name: category.name }), createdByUserId],
    );
    await client.query('COMMIT');
    return category;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function renameCategory(id, { name, reason, changedByUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const previousResult = await client.query(
      'SELECT id, name FROM item_categories WHERE id = $1 FOR UPDATE',
      [id],
    );
    const previous = previousResult.rows[0];
    if (!previous) {
      throw Object.assign(new Error('Hindi na makita ang category na babaguhin.'), { status: 404 });
    }

    const renamedResult = await client.query(
      `UPDATE item_categories
          SET name = $2, updated_at = NOW()
        WHERE id = $1
       RETURNING id, name`,
      [id, name],
    );
    const renamed = renamedResult.rows[0];
    await client.query(
      'UPDATE item_catalog SET category = $2 WHERE category_id = $1',
      [id, renamed.name],
    );
    await client.query(
      `INSERT INTO inventory_change_logs (
         entity_type, entity_key, entity_name, category_id, action, reason,
         old_values, new_values, changed_by_user_id
       ) VALUES ('category', $1, $2, $3, 'renamed', $4, $5::JSONB, $6::JSONB, $7)`,
      [
        String(id),
        renamed.name,
        id,
        reason,
        JSON.stringify({ name: previous.name }),
        JSON.stringify({ name: renamed.name }),
        changedByUserId,
      ],
    );
    await client.query('COMMIT');
    return renamed;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteCategory(id, { reason, changedByUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const categoryResult = await client.query(
      'SELECT id, name FROM item_categories WHERE id = $1 FOR UPDATE',
      [id],
    );
    const category = categoryResult.rows[0];
    if (!category) {
      throw Object.assign(new Error('Hindi na makita ang category na buburahin.'), { status: 404 });
    }

    const categoryCountResult = await client.query('SELECT COUNT(*)::INTEGER AS count FROM item_categories');
    if (categoryCountResult.rows[0].count <= 1) {
      throw Object.assign(new Error('Kailangang may matirang kahit isang inventory category.'), { status: 409 });
    }

    const usageResult = await client.query(
      'SELECT COUNT(*)::INTEGER AS count FROM item_catalog WHERE category_id = $1',
      [id],
    );
    if (usageResult.rows[0].count > 0) {
      throw Object.assign(new Error('May inventory item pang gumagamit sa category na ito. Ilipat muna ang mga item sa ibang category bago ito burahin.'), {
        status: 409,
      });
    }

    await client.query(
      `INSERT INTO inventory_change_logs (
         entity_type, entity_key, entity_name, category_id, action, reason,
         old_values, new_values, changed_by_user_id
       ) VALUES ('category', $1, $2, $3, 'deleted', $4, $5::JSONB, '{}'::JSONB, $6)`,
      [String(id), category.name, id, reason, JSON.stringify({ name: category.name }), changedByUserId],
    );
    await client.query('DELETE FROM item_categories WHERE id = $1', [id]);
    await client.query('COMMIT');
    return category;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listItems,
  createItem,
  updateItem,
  listCategories,
  createCategory,
  renameCategory,
  deleteCategory,
};
