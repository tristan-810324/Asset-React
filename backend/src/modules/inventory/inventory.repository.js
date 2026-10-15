const pool = require('../../config/db');

const itemColumns = `
  i.id,
  i.item_code AS "itemCode",
  i.category,
  i.description,
  to_char(i.date_acquired, 'YYYY-MM-DD') AS "dateAcquired",
  to_char(i.time_acquired, 'HH24:MI') AS "timeAcquired",
  i.unit_cost AS "unitCost",
  i.acquisition_cost AS "acquisitionCost",
  i.current_value AS "currentValue",
  i.quantity,
  i.unit_of_measure AS "unitOfMeasure",
  i.condition,
  i.inventory_status AS status,
  i.created_at AS "createdAt",
  creator.name AS "createdBy",
  COALESCE((
    SELECT json_agg(json_build_object(
      'action', change.action,
      'reason', change.reason,
      'oldValues', change.old_values,
      'newValues', change.new_values,
      'changedAt', change.changed_at,
      'changedBy', editor.name
    ) ORDER BY change.changed_at DESC, change.id DESC)
      FROM inventory_change_logs AS change
      LEFT JOIN users AS editor ON editor.id = change.changed_by_user_id
     WHERE change.entity_type = 'item'
       AND change.item_id = i.id
  ), '[]'::JSON) AS "changeHistory"
`;

async function listItems() {
  const result = await pool.query(
    `SELECT ${itemColumns}
       FROM item_catalog AS i
       LEFT JOIN users AS creator ON creator.id = i.created_by_user_id
      ORDER BY i.created_at DESC, i.id DESC`,
  );
  return result.rows;
}

async function getItemById(queryable, id) {
  const result = await queryable.query(
    `SELECT ${itemColumns}
       FROM item_catalog AS i
       LEFT JOIN users AS creator ON creator.id = i.created_by_user_id
      WHERE i.id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

async function createItem({
  itemCode,
  category,
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
         item_code, category_id, category, description, date_acquired, time_acquired,
         unit_cost, acquisition_cost, current_value, quantity, unit_of_measure,
         condition, created_by_user_id
       )
       SELECT $1, category_row.id, category_row.name, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
         FROM item_categories AS category_row
        WHERE lower(category_row.name) = lower($2)
       RETURNING id`,
      [
        itemCode,
        category,
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
      [String(id), created.description, id, JSON.stringify({
        itemCode: created.itemCode,
        category: created.category,
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

    const updateResult = await client.query(
      `UPDATE item_catalog AS inventory_item
          SET item_code = $2,
              category_id = category_row.id,
              category = category_row.name,
              description = $4,
              date_acquired = $5,
              time_acquired = $6,
              unit_cost = $7,
              acquisition_cost = $8,
              current_value = $9,
              quantity = $10,
              unit_of_measure = $11,
              condition = $12
         FROM item_categories AS category_row
        WHERE inventory_item.id = $1
          AND lower(category_row.name) = lower($3)
       RETURNING inventory_item.id`,
      [
        id,
        item.itemCode,
        item.category,
        item.description,
        item.dateAcquired,
        item.timeAcquired,
        item.unitCost,
        item.acquisitionCost,
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
        updated.description,
        id,
        item.reason,
        JSON.stringify(itemSnapshot(previous)),
        JSON.stringify({
          itemCode: updated.itemCode,
          category: updated.category,
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
