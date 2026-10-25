const pool = require('../../config/db');

async function getOperationalReports() {
  const [inventory, requests, issuances, returns, movements, assetUnits] = await Promise.all([
    pool.query(`
      WITH active AS (
        SELECT issue.item_id, SUM(issue.quantity - issue.returned_quantity)::INTEGER AS qty
          FROM employee_issuances AS issue WHERE issue.status IN ('Pending', 'Issued') GROUP BY issue.item_id
        UNION ALL
        SELECT asset.item_id, SUM(asset.quantity)::INTEGER AS qty
          FROM service_request_assets AS asset JOIN service_requests AS request ON request.id = asset.request_id
         WHERE request.status IN ('Approved', 'Ready for Pickup', 'Issued', 'Return Requested', 'For Repair') GROUP BY asset.item_id
      ), used AS (SELECT item_id, SUM(qty)::INTEGER AS qty FROM active GROUP BY item_id)
      SELECT item.item_code AS "itemCode", COALESCE(NULLIF(item.item_name, ''), item.description) AS "itemName",
             item.category, item.quantity, GREATEST(item.quantity - COALESCE(used.qty, 0) - COALESCE((SELECT COUNT(*) FROM asset_unit_tags AS tag
               WHERE tag.item_id = item.id AND tag.lifecycle_status = 'Pending Disposal' AND tag.custody_status = 'Available'), 0), 0)::INTEGER AS "availableQuantity",
             item.unit_of_measure AS "unitOfMeasure", item.condition, item.location, item.reorder_level AS "reorderLevel",
             item.lifecycle_status AS "lifecycleStatus", item.acquisition_cost AS "acquisitionCost", item.current_value AS "currentValue"
        FROM item_catalog AS item LEFT JOIN used ON used.item_id = item.id
       ORDER BY item.item_code LIMIT 10000`),
    pool.query(`SELECT request.reference_no AS "referenceNo", request.request_type AS "requestType", request.title,
                       request.status, request.created_at AS "createdAt", requester.name AS "requesterName",
                       requester.email AS "requesterEmail", request.form_data AS "formData",
                       request.external_forwarded_at AS "externalForwardedAt", request.external_forwarded_to AS "externalForwardedTo",
                       request.external_reference AS "externalReference"
                  FROM service_requests AS request JOIN users AS requester ON requester.id = request.requested_by_user_id
                 ORDER BY request.created_at DESC LIMIT 10000`),
    pool.query(`SELECT issue.id, employee.employee_code AS "employeeCode",
                       employee.first_name || ' ' || employee.last_name AS "employeeName", employee.department,
                       item.item_code AS "itemCode", COALESCE(NULLIF(item.item_name, ''), item.description) AS "itemName",
                       issue.quantity, issue.returned_quantity AS "returnedQuantity", issue.unit_of_measure AS "unitOfMeasure",
                       issue.status, issue.item_condition AS condition, issue.requested_at AS "requestedAt", issue.decided_at AS "issuedAt"
                  FROM employee_issuances AS issue JOIN employees AS employee ON employee.id = issue.employee_id
                  JOIN item_catalog AS item ON item.id = issue.item_id
                 ORDER BY issue.requested_at DESC LIMIT 10000`),
    pool.query(`SELECT returned.id, employee.employee_code AS "employeeCode",
                       employee.first_name || ' ' || employee.last_name AS "employeeName",
                       item.item_code AS "itemCode", COALESCE(NULLIF(item.item_name, ''), item.description) AS "itemName",
                       returned.quantity, returned.return_condition AS condition, returned.status,
                       returned.reason, returned.requested_at AS "requestedAt", returned.decided_at AS "returnedAt"
                  FROM employee_issuance_returns AS returned
                  JOIN employee_issuances AS issue ON issue.id = returned.issuance_id
                  JOIN employees AS employee ON employee.id = issue.employee_id
                  JOIN item_catalog AS item ON item.id = issue.item_id
                 ORDER BY returned.requested_at DESC LIMIT 10000`),
    pool.query(`SELECT movement.id, item.item_code AS "itemCode", COALESCE(NULLIF(item.item_name, ''), item.description) AS "itemName",
                       movement.movement_type AS "movementType", movement.quantity,
                       source.employee_code AS "fromEmployeeCode", source.first_name || ' ' || source.last_name AS "fromEmployee",
                       movement.from_location AS "fromLocation",
                       destination.employee_code AS "toEmployeeCode", destination.first_name || ' ' || destination.last_name AS "toEmployee",
                       movement.to_location AS "toLocation", movement.reason, movement.recipient_acknowledgement AS acknowledgement,
                       movement.created_at AS "createdAt", actor.name AS "recordedBy"
                  FROM asset_movements AS movement JOIN item_catalog AS item ON item.id = movement.item_id
                  LEFT JOIN employees AS source ON source.id = movement.from_employee_id
                  LEFT JOIN employees AS destination ON destination.id = movement.to_employee_id
                  LEFT JOIN users AS actor ON actor.id = movement.recorded_by_user_id
                 ORDER BY movement.created_at DESC LIMIT 10000`),
    pool.query(`SELECT tag.tag_code AS "tagCode", tag.serial_number AS "serialNumber",
                       item.item_code AS "itemCode", COALESCE(NULLIF(item.item_name, ''), item.description) AS "itemName",
                       tag.unit_number AS "unitNumber", tag.location, tag.condition,
                       tag.lifecycle_status AS "lifecycleStatus", tag.custody_status AS "custodyStatus",
                       employee.employee_code AS "employeeCode", employee.first_name || ' ' || employee.last_name AS "employeeName",
                       borrower.name AS "borrowerName", tag.disposal_reason AS "disposalReason",
                       tag.disposal_reference AS "disposalReference", tag.created_at AS "createdAt"
                  FROM asset_unit_tags AS tag JOIN item_catalog AS item ON item.id = tag.item_id
                  LEFT JOIN employees AS employee ON employee.id = tag.assigned_employee_id
                  LEFT JOIN users AS borrower ON borrower.id = tag.assigned_user_id
                 ORDER BY item.item_code, tag.unit_number LIMIT 10000`),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    inventory: inventory.rows,
    requests: requests.rows,
    issuances: issuances.rows,
    returns: returns.rows,
    movements: movements.rows,
    assetUnits: assetUnits.rows,
  };
}

module.exports = { getOperationalReports };
