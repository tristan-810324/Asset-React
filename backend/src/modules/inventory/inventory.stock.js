async function getItemStockUsage(queryable, itemId) {
  const result = await queryable.query(
    `SELECT COALESCE(SUM(quantity) FILTER (WHERE status = 'Pending'), 0)::INTEGER AS "pendingQuantity",
            COALESCE(SUM(quantity - returned_quantity) FILTER (WHERE status = 'Issued'), 0)::INTEGER AS "issuedQuantity",
            (COALESCE(SUM(quantity) FILTER (WHERE status = 'Pending'), 0)
              + COALESCE(SUM(quantity - returned_quantity) FILTER (WHERE status = 'Issued'), 0))::INTEGER AS "activeQuantity"
       FROM employee_issuances
      WHERE item_id = $1
        AND status IN ('Pending', 'Issued')`,
    [itemId],
  );
  return result.rows[0] || { pendingQuantity: 0, issuedQuantity: 0, activeQuantity: 0 };
}

async function getAvailableQuantity(queryable, item) {
  const usage = await getItemStockUsage(queryable, item.id);
  return Math.max(0, Number(item.quantity) - Number(usage.activeQuantity));
}

async function refreshInventoryStatus(queryable, itemId) {
  const usage = await getItemStockUsage(queryable, itemId);
  const result = await queryable.query(
    `UPDATE item_catalog
        SET inventory_status = CASE
          WHEN inventory_status = 'Borrowed' AND $2 = 0 THEN 'Borrowed'
          WHEN quantity > $2 THEN 'Available'
          WHEN $3 > 0 THEN 'Reserved'
          WHEN $4 > 0 THEN 'Issued'
          ELSE 'Available'
        END
      WHERE id = $1
      RETURNING inventory_status`,
    [itemId, usage.activeQuantity, usage.pendingQuantity, usage.issuedQuantity],
  );
  return result.rows[0]?.inventory_status || null;
}

module.exports = { getItemStockUsage, getAvailableQuantity, refreshInventoryStatus };
