const repairConditions = ['Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired'];

async function addRepairHold(queryable, itemId, usage) {
  const result = await queryable.query(
    `SELECT item.quantity,
            item.condition AS item_condition,
            item.repair_quantity AS bulk_repair_quantity,
            COUNT(tag.id)::INTEGER AS tagged_quantity,
            COUNT(tag.id) FILTER (
              WHERE tag.custody_status = 'Available'
                AND tag.lifecycle_status <> 'Disposed'
                AND tag.condition IN ('Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired')
            )::INTEGER AS repair_quantity
       FROM item_catalog AS item
       LEFT JOIN asset_unit_tags AS tag ON tag.item_id = item.id
      WHERE item.id = $1
      GROUP BY item.id`,
    [itemId],
  );
  const item = result.rows[0];
  if (!item) return { ...usage, repairQuantity: 0 };
  // Bulk stock: a whole-stock repair condition holds everything; otherwise only the units set
  // aside by damaged returns. Tagged stock counts its own units in repair.
  const repairQuantity = Number(item.tagged_quantity) === 0
    ? repairConditions.includes(item.item_condition) ? Number(item.quantity) : Number(item.bulk_repair_quantity || 0)
    : Number(item.repair_quantity || 0);
  return { ...usage, repairQuantity };
}

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
    return addRepairHold(queryable, itemId, result.rows[0] || { pendingQuantity: 0, issuedQuantity: 0, activeQuantity: 0 });
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
     ), requisition_usage AS (
       SELECT COALESCE(SUM(allocation.quantity - allocation.fulfilled_quantity), 0)::INTEGER AS reserved_quantity
         FROM purchase_requisition_line_allocations AS allocation
        WHERE allocation.item_id = $1 AND allocation.status = 'Reserved'
     )
     SELECT (employee_usage.pending_quantity + borrower_usage.reserved_quantity + requisition_usage.reserved_quantity)::INTEGER AS "pendingQuantity",
            (employee_usage.issued_quantity + borrower_usage.issued_quantity)::INTEGER AS "issuedQuantity",
            (employee_usage.pending_quantity + employee_usage.issued_quantity
              + borrower_usage.reserved_quantity + borrower_usage.issued_quantity + requisition_usage.reserved_quantity)::INTEGER AS "activeQuantity"
       FROM employee_usage CROSS JOIN borrower_usage CROSS JOIN requisition_usage`,
    [itemId],
  );
  return addRepairHold(queryable, itemId, result.rows[0] || { pendingQuantity: 0, issuedQuantity: 0, activeQuantity: 0 });
}

async function getAvailableQuantity(queryable, item) {
  const usage = await getItemStockUsage(queryable, item.id);
  return Math.max(0, Number(item.quantity) - Number(usage.activeQuantity) - Number(usage.repairQuantity || 0));
}

async function refreshInventoryStatus(queryable, itemId) {
  const usage = await getItemStockUsage(queryable, itemId);
  const result = await queryable.query(
    `UPDATE item_catalog
        SET inventory_status = CASE
          WHEN inventory_status = 'Borrowed' AND $2 = 0 THEN 'Borrowed'
          WHEN quantity > ($2 + $5) THEN 'Available'
          WHEN $3 > 0 THEN 'Reserved'
          WHEN $4 > 0 THEN 'Issued'
          ELSE 'Available'
        END
      WHERE id = $1
      RETURNING inventory_status`,
    [itemId, usage.activeQuantity, usage.pendingQuantity, usage.issuedQuantity, usage.repairQuantity || 0],
  );
  return result.rows[0]?.inventory_status || null;
}

module.exports = { getItemStockUsage, getAvailableQuantity, refreshInventoryStatus };
