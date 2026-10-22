async function getItemStockUsage(queryable, itemId) {
  const requestTables = await queryable.query("SELECT to_regclass('public.service_request_assets') IS NOT NULL AS available");
  if (!requestTables.rows[0]?.available) {
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

  const result = await queryable.query(
    `WITH employee_usage AS (
       SELECT COALESCE(SUM(quantity) FILTER (WHERE status = 'Pending'), 0)::INTEGER AS pending_quantity,
              COALESCE(SUM(quantity - returned_quantity) FILTER (WHERE status = 'Issued'), 0)::INTEGER AS issued_quantity
         FROM employee_issuances
        WHERE item_id = $1 AND status IN ('Pending', 'Issued')
     ), borrower_usage AS (
       SELECT COALESCE(SUM(asset.quantity) FILTER (WHERE request.status IN ('Approved', 'Ready for Pickup')), 0)::INTEGER AS reserved_quantity,
              COALESCE(SUM(asset.quantity) FILTER (WHERE request.status IN ('Issued', 'Return Requested', 'For Repair')), 0)::INTEGER AS issued_quantity
         FROM service_request_assets AS asset
         JOIN service_requests AS request ON request.id = asset.request_id
        WHERE asset.item_id = $1
     )
     SELECT (employee_usage.pending_quantity + borrower_usage.reserved_quantity)::INTEGER AS "pendingQuantity",
            (employee_usage.issued_quantity + borrower_usage.issued_quantity)::INTEGER AS "issuedQuantity",
            (employee_usage.pending_quantity + employee_usage.issued_quantity
              + borrower_usage.reserved_quantity + borrower_usage.issued_quantity)::INTEGER AS "activeQuantity"
       FROM employee_usage CROSS JOIN borrower_usage`,
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
