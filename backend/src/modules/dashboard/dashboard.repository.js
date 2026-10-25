const pool = require('../../config/db');

async function getSummary() {
  const [inventory, conditions, locations, departments, requests, movements] = await Promise.all([
    pool.query(`
      WITH active AS (
        SELECT issue.item_id, SUM(issue.quantity - issue.returned_quantity)::INTEGER AS qty
          FROM employee_issuances AS issue
         WHERE issue.status IN ('Pending', 'Issued')
         GROUP BY issue.item_id
        UNION ALL
        SELECT asset.item_id, SUM(asset.quantity)::INTEGER AS qty
          FROM service_request_assets AS asset
          JOIN service_requests AS request ON request.id = asset.request_id
         WHERE request.status IN ('Approved', 'Ready for Pickup', 'Issued', 'Return Requested', 'For Repair')
         GROUP BY asset.item_id
      ), used AS (SELECT item_id, SUM(qty)::INTEGER AS qty FROM active GROUP BY item_id),
      stock AS (
        SELECT item.id, item.quantity, item.reorder_level, item.lifecycle_status,
               GREATEST(item.quantity - COALESCE(used.qty, 0) - COALESCE((SELECT COUNT(*) FROM asset_unit_tags AS tag
                 WHERE tag.item_id = item.id AND tag.lifecycle_status = 'Pending Disposal' AND tag.custody_status = 'Available'), 0), 0)::INTEGER AS available
          FROM item_catalog AS item LEFT JOIN used ON used.item_id = item.id
      )
      SELECT COUNT(*) FILTER (WHERE lifecycle_status = 'Active')::INTEGER AS "catalogItems",
             COALESCE(SUM(quantity) FILTER (WHERE lifecycle_status = 'Active'), 0)::INTEGER AS "totalQuantity",
             COALESCE(SUM(available) FILTER (WHERE lifecycle_status = 'Active'), 0)::INTEGER AS "availableQuantity",
             COUNT(*) FILTER (WHERE lifecycle_status = 'Active' AND reorder_level > 0 AND available <= reorder_level)::INTEGER AS "lowStockItems",
             COUNT(*) FILTER (WHERE lifecycle_status = 'Pending Disposal')::INTEGER AS "pendingDisposals",
             COUNT(*) FILTER (WHERE lifecycle_status = 'Disposed')::INTEGER AS "disposedItems"
        FROM stock`),
    pool.query(`SELECT condition, COUNT(*)::INTEGER AS "itemCount", COALESCE(SUM(quantity), 0)::INTEGER AS quantity
                  FROM item_catalog WHERE lifecycle_status = 'Active' GROUP BY condition ORDER BY condition`),
    pool.query(`SELECT COALESCE(NULLIF(trim(location), ''), 'Unassigned') AS name,
                       COUNT(*)::INTEGER AS "itemCount", COALESCE(SUM(quantity), 0)::INTEGER AS quantity
                  FROM item_catalog WHERE lifecycle_status = 'Active'
                 GROUP BY COALESCE(NULLIF(trim(location), ''), 'Unassigned') ORDER BY quantity DESC, name LIMIT 10`),
    pool.query(`SELECT employee.department AS name, COUNT(DISTINCT employee.id)::INTEGER AS employees,
                       COALESCE(SUM(issue.quantity - issue.returned_quantity), 0)::INTEGER AS "issuedQuantity"
                  FROM employees AS employee
                  LEFT JOIN employee_issuances AS issue ON issue.employee_id = employee.id AND issue.status = 'Issued'
                 WHERE employee.status = 'Active'
                 GROUP BY employee.department ORDER BY "issuedQuantity" DESC, name LIMIT 10`),
    pool.query(`SELECT status, COUNT(*)::INTEGER AS count FROM service_requests GROUP BY status ORDER BY status`),
    pool.query(`SELECT COUNT(*)::INTEGER AS count FROM asset_movements WHERE created_at >= NOW() - INTERVAL '30 days'`),
  ]);
  const overdue = await pool.query(`SELECT COUNT(DISTINCT request.id)::INTEGER AS count
    FROM service_requests AS request JOIN service_request_assets AS asset ON asset.request_id = request.id
   WHERE request.request_type = 'BORROWING' AND request.status IN ('Issued', 'Return Requested') AND asset.due_date < CURRENT_DATE`);
  const issued = await pool.query(`SELECT COALESCE(SUM(quantity - returned_quantity), 0)::INTEGER AS count
    FROM employee_issuances WHERE status = 'Issued'`);
  return {
    inventory: inventory.rows[0],
    conditions: conditions.rows,
    locations: locations.rows,
    departments: departments.rows,
    requestsByStatus: requests.rows,
    overdueBorrowings: overdue.rows[0].count,
    activeEmployeeIssuedQuantity: issued.rows[0].count,
    movementsLast30Days: movements.rows[0].count,
  };
}

module.exports = { getSummary };
