const pool = require('../../config/db');

const itemColumns = `
  i.id,
  i.item_code AS "itemCode",
  i.category,
  i.item_name AS "itemName",
  i.description,
  i.tracking_mode AS "trackingMode",
  i.issue_behavior AS "issueBehavior",
  i.serial_number AS "serialNumber",
  i.location AS "storageLocation",
  COALESCE((
    SELECT json_agg(json_build_object(
      'tagCode', tag.tag_code,
      'unitNumber', tag.unit_number,
      'serialNumber', tag.serial_number,
      'location', tag.location,
      'condition', tag.condition,
      'lifecycleStatus', tag.lifecycle_status,
      'custodyStatus', tag.custody_status
    ) ORDER BY tag.unit_number)
      FROM asset_unit_tags AS tag
     WHERE tag.item_id = i.id
  ), '[]'::JSON) AS "assetTags",
  COALESCE((
    SELECT json_agg(json_build_object(
      'id', receipt.id::TEXT,
      'quantity', receipt.quantity,
      'unitCost', receipt.unit_cost,
      'totalCost', receipt.total_cost,
      'dateAcquired', to_char(receipt.date_acquired, 'YYYY-MM-DD'),
      'timeAcquired', to_char(receipt.time_acquired, 'HH24:MI'),
      'referenceNumber', receipt.reference_number,
      'createdAt', receipt.created_at
    ) ORDER BY receipt.created_at DESC, receipt.id DESC)
      FROM inventory_receipts AS receipt
     WHERE receipt.item_id = i.id
  ), '[]'::JSON) AS "receiptHistory",
  to_char(i.date_acquired, 'YYYY-MM-DD') AS "dateAcquired",
  to_char(i.time_acquired, 'HH24:MI') AS "timeAcquired",
  i.unit_cost AS "unitCost",
  i.acquisition_cost AS "acquisitionCost",
  i.current_value AS "currentValue",
  i.quantity,
  GREATEST(i.quantity - COALESCE(stock_usage.active_quantity, 0) - COALESCE(stock_usage.repair_quantity, 0), 0)::INTEGER AS "availableQuantity",
  i.unit_of_measure AS "unitOfMeasure",
  i.condition,
  CASE
    WHEN i.inventory_status = 'Borrowed' AND COALESCE(stock_usage.active_quantity, 0) = 0 THEN 'Borrowed'
    WHEN i.quantity > COALESCE(stock_usage.active_quantity, 0) + COALESCE(stock_usage.repair_quantity, 0) THEN 'Available'
    WHEN COALESCE(stock_usage.pending_quantity, 0) > 0 THEN 'Pending Approval'
    WHEN COALESCE(stock_usage.reserved_quantity, 0) > 0 THEN 'Reserved'
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
               issuer.name AS changed_by,
               issue.id AS sort_id
          FROM employee_issuances AS issue
          JOIN employees AS employee ON employee.id = issue.employee_id
          LEFT JOIN users AS issuer ON issuer.id = issue.requested_by_user_id
         WHERE issue.item_id = i.id
           AND issue.status IN ('Issued', 'Returned')
           AND issue.decided_at IS NOT NULL

        UNION ALL

        SELECT 'returned'::TEXT AS action,
               'Returned by ' || employee.first_name || ' ' || employee.last_name || ' (' || employee.employee_code || ').' AS reason,
               jsonb_build_object('inventoryStatus', 'Issued') AS old_values,
               jsonb_build_object(
                 'inventoryStatus', 'Available',
                 'condition', return_request.return_condition,
                 'tagCode', returned_tag.tag_code
               ) AS new_values,
               return_request.decided_at AS changed_at,
               employee.first_name || ' ' || employee.last_name AS changed_by,
               return_request.id AS sort_id
          FROM employee_issuance_returns AS return_request
          JOIN employee_issuances AS issue ON issue.id = return_request.issuance_id
          JOIN employees AS employee ON employee.id = issue.employee_id
          LEFT JOIN asset_unit_tags AS returned_tag ON returned_tag.id = return_request.asset_unit_tag_id
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

async function hasRequesterInventory(queryable) {
  const result = await queryable.query("SELECT to_regclass('public.service_request_assets') IS NOT NULL AS available");
  return Boolean(result.rows[0]?.available);
}

function stockUsageJoin(includeRequesterInventory) {
  const borrowerReserved = includeRequesterInventory
    ? `COALESCE((
         SELECT SUM(asset.quantity)
           FROM service_request_assets AS asset
           JOIN service_requests AS request ON request.id = asset.request_id
          WHERE asset.item_id = i.id AND request.status IN ('Approved', 'Ready for Pickup')
       ), 0)`
    : '0';
  const borrowerIssued = includeRequesterInventory
    ? `COALESCE((
         SELECT SUM(asset.quantity)
           FROM service_request_assets AS asset
           JOIN service_requests AS request ON request.id = asset.request_id
          WHERE asset.item_id = i.id AND request.status IN ('Issued', 'Return Requested', 'For Repair')
       ), 0)`
    : '0';
  return `LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(issue.quantity) FILTER (WHERE issue.status = 'Pending'), 0)::INTEGER AS pending_quantity,
           (${borrowerReserved})::INTEGER AS reserved_quantity,
           (COALESCE(SUM(issue.quantity - issue.returned_quantity) FILTER (WHERE issue.status = 'Issued'), 0)
             + (${borrowerIssued}))::INTEGER AS issued_quantity,
           (COALESCE(SUM(issue.quantity) FILTER (WHERE issue.status = 'Pending'), 0)
             + COALESCE(SUM(issue.quantity - issue.returned_quantity) FILTER (WHERE issue.status = 'Issued'), 0)
             + (${borrowerReserved}) + (${borrowerIssued}))::INTEGER AS active_quantity,
           CASE
             WHEN NOT EXISTS (SELECT 1 FROM asset_unit_tags AS existing_tag WHERE existing_tag.item_id = i.id)
                  AND i.condition IN ('Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired')
               THEN i.quantity
             WHEN NOT EXISTS (SELECT 1 FROM asset_unit_tags AS existing_tag WHERE existing_tag.item_id = i.id)
               THEN i.repair_quantity
             ELSE COALESCE((
               SELECT COUNT(*)::INTEGER
                 FROM asset_unit_tags AS repair_tag
                WHERE repair_tag.item_id = i.id
                  AND repair_tag.custody_status = 'Available'
                  AND repair_tag.lifecycle_status <> 'Disposed'
                  AND repair_tag.condition IN ('Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired')
             ), 0)
           END::INTEGER AS repair_quantity,
           COUNT(DISTINCT issue.employee_id) FILTER (WHERE issue.status IN ('Pending', 'Issued'))::INTEGER AS active_employee_count
      FROM employee_issuances AS issue
     WHERE issue.item_id = i.id
       AND issue.status IN ('Pending', 'Issued')
  ) AS stock_usage ON TRUE`;
}

// Who holds reusable stock right now, read from the same records and quantities that
// stockUsageJoin subtracts, so this list always agrees with availableQuantity.
function currentBorrowersColumn(includeRequesterInventory) {
  const requesterBorrowers = includeRequesterInventory
    ? `UNION ALL

        SELECT 'request-' || asset.id::TEXT AS id,
               requester.name AS borrower_name,
               request.reference_no AS reference,
               profile.department,
               CASE
                 WHEN request.status IN ('Approved', 'Ready for Pickup') THEN 'Reserved'
                 WHEN request.status = 'For Repair' THEN 'For repair'
                 ELSE 'Borrowed'
               END AS state,
               asset.quantity,
               to_char(COALESCE(asset.issued_at, request.updated_at) AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI') AS issued_at,
               request.form_data->>'neededDate' AS use_at,
               COALESCE(to_char(asset.due_date, 'YYYY-MM-DD'), request.form_data->>'returnDate') AS expected_return_at,
               request.form_data->>'useLocation' AS use_location,
               request.form_data->>'purpose' AS purpose,
               request.status IN ('Issued', 'Return Requested')
                 AND COALESCE(asset.due_date < (NOW() AT TIME ZONE 'Asia/Manila')::DATE, FALSE) AS is_overdue
          FROM service_request_assets AS asset
          JOIN service_requests AS request ON request.id = asset.request_id
          JOIN users AS requester ON requester.id = request.requested_by_user_id
          LEFT JOIN requester_identity_profiles AS profile ON profile.user_id = requester.id
         WHERE asset.item_id = i.id
           AND request.status IN ('Approved', 'Ready for Pickup', 'Issued', 'Return Requested', 'For Repair')`
    : '';
  return `COALESCE((
    SELECT json_agg(json_build_object(
      'id', borrower.id,
      'borrowerName', borrower.borrower_name,
      'reference', borrower.reference,
      'department', borrower.department,
      'state', borrower.state,
      'quantity', borrower.quantity,
      'issuedAt', borrower.issued_at,
      'useAt', borrower.use_at,
      'expectedReturnAt', borrower.expected_return_at,
      'useLocation', borrower.use_location,
      'purpose', borrower.purpose,
      'isOverdue', borrower.is_overdue
    ) ORDER BY borrower.state, borrower.expected_return_at NULLS LAST, borrower.borrower_name, borrower.id)
      FROM (
        SELECT 'issuance-' || issue.id::TEXT AS id,
               employee.first_name || ' ' || employee.last_name AS borrower_name,
               employee.employee_code AS reference,
               employee.department,
               CASE WHEN issue.status = 'Issued' THEN 'Borrowed' ELSE 'Reserved' END AS state,
               issue.quantity - issue.returned_quantity AS quantity,
               to_char(COALESCE(issue.decided_at, issue.requested_at) AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI') AS issued_at,
               COALESCE(to_char(batch.borrow_use_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI'), batch.borrow_use_date::TEXT) AS use_at,
               COALESCE(to_char(batch.expected_return_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI'), batch.expected_return_date::TEXT) AS expected_return_at,
               batch.use_location,
               batch.use_purpose AS purpose,
               issue.status = 'Issued'
                 AND COALESCE(batch.expected_return_at < NOW(), batch.expected_return_date < (NOW() AT TIME ZONE 'Asia/Manila')::DATE, FALSE) AS is_overdue
          FROM employee_issuances AS issue
          JOIN employees AS employee ON employee.id = issue.employee_id
          LEFT JOIN employee_issuance_batches AS batch ON batch.id = issue.batch_id
         WHERE issue.item_id = i.id
           AND issue.status IN ('Pending', 'Issued')
           AND issue.quantity > issue.returned_quantity

        ${requesterBorrowers}
      ) AS borrower
     WHERE i.tracking_mode = 'quantity'
       AND i.issue_behavior = 'returnable'
  ), '[]'::JSON) AS "currentBorrowers"`;
}

async function listItems() {
  const includeRequesterInventory = await hasRequesterInventory(pool);
  const result = await pool.query(
    `SELECT ${itemColumns},
            ${currentBorrowersColumn(includeRequesterInventory)}
       FROM item_catalog AS i
       LEFT JOIN users AS creator ON creator.id = i.created_by_user_id
       ${stockUsageJoin(includeRequesterInventory)}
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
  const includeRequesterInventory = await hasRequesterInventory(queryable);
  const result = await queryable.query(
    `SELECT ${itemColumns},
            ${currentBorrowersColumn(includeRequesterInventory)}
       FROM item_catalog AS i
       LEFT JOIN users AS creator ON creator.id = i.created_by_user_id
       ${stockUsageJoin(includeRequesterInventory)}
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

async function insertInventoryReceipt(client, itemId, receipt) {
  await client.query(
    `INSERT INTO inventory_receipts (
       item_id, quantity, unit_cost, total_cost, date_acquired, time_acquired,
       reference_number, recorded_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      itemId,
      receipt.quantity,
      receipt.unitCost,
      receipt.acquisitionCost,
      receipt.dateAcquired,
      receipt.timeAcquired,
      receipt.receiptReference || '',
      receipt.createdByUserId,
    ],
  );
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
  trackingMode,
  issueBehavior,
  serialNumber,
  receiptReference,
  storageLocation,
  createdByUserId,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO item_catalog (
         item_code, category_id, category, item_name, description, date_acquired, time_acquired,
         unit_cost, acquisition_cost, current_value, quantity, unit_of_measure,
         condition, tracking_mode, issue_behavior, location, serial_number, created_by_user_id
       )
       SELECT $1, category_row.id, category_row.name, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
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
        trackingMode,
        issueBehavior,
        storageLocation || 'GSO Storage',
        serialNumber || null,
        createdByUserId,
      ],
    );

    if (!result.rows[0]) {
      throw Object.assign(new Error('Hindi na makita ang piniling category. I-refresh ang page at pumili muli.'), {
        code: 'CATEGORY_NOT_FOUND',
      });
    }

    const id = result.rows[0].id;
    await insertInventoryReceipt(client, id, {
      quantity,
      unitCost,
      acquisitionCost,
      dateAcquired,
      timeAcquired,
      receiptReference,
      createdByUserId,
    });
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
        trackingMode: created.trackingMode,
        issueBehavior: created.issueBehavior,
        storageLocation: created.storageLocation,
        receiptReference,
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

async function createItems(items, { createdByUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const createdItems = [];

    for (const item of items) {
      const result = await client.query(
        `INSERT INTO item_catalog (
           item_code, category_id, category, item_name, description, date_acquired, time_acquired,
           unit_cost, acquisition_cost, current_value, quantity, unit_of_measure,
           condition, tracking_mode, issue_behavior, location, serial_number, created_by_user_id
         )
         SELECT $1, category_row.id, category_row.name, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
           FROM item_categories AS category_row
          WHERE lower(category_row.name) = lower($2)
         RETURNING id`,
        [
          item.itemCode,
          item.category,
          item.itemName,
          item.description,
          item.dateAcquired,
          item.timeAcquired,
          item.unitCost,
          item.acquisitionCost,
          item.currentValue,
          item.quantity,
          item.unitOfMeasure,
          item.condition,
          item.trackingMode,
          item.issueBehavior,
          item.storageLocation || 'GSO Storage',
          item.serialNumber || null,
          createdByUserId,
        ],
      );

      if (!result.rows[0]) {
        throw Object.assign(new Error('Hindi na makita ang piniling category. I-refresh ang page at pumili muli.'), {
          code: 'CATEGORY_NOT_FOUND',
        });
      }

      const id = result.rows[0].id;
      await insertInventoryReceipt(client, id, {
        quantity: item.quantity,
        unitCost: item.unitCost,
        acquisitionCost: item.acquisitionCost,
        dateAcquired: item.dateAcquired,
        timeAcquired: item.timeAcquired,
        receiptReference: item.receiptReference,
        createdByUserId,
      });
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
          trackingMode: created.trackingMode,
          issueBehavior: created.issueBehavior,
          storageLocation: created.storageLocation,
          receiptReference: item.receiptReference || '',
        }), createdByUserId],
      );
      createdItems.push(await getItemById(client, id));
    }

    await client.query('COMMIT');
    return createdItems;
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
    trackingMode: item.tracking_mode,
    issueBehavior: item.issue_behavior,
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

    const nextTrackingMode = item.trackingMode ?? previous.tracking_mode ?? 'individual';
    const nextIssueBehavior = nextTrackingMode === 'individual'
      ? 'returnable'
      : item.issueBehavior ?? previous.issue_behavior ?? 'returnable';
    const trackingModeChanged = nextTrackingMode !== (previous.tracking_mode ?? 'individual');
    if (nextTrackingMode === 'individual' && nextIssueBehavior === 'consumable') {
      throw Object.assign(new Error('Ang item na tina-track nang paisa-isa ay dapat ibinabalik bilang individual item.'), { status: 400 });
    }
    if (nextIssueBehavior === 'consumable'
      && previous.issue_behavior !== 'consumable'
      && activeIssuanceQuantity > 0) {
      throw Object.assign(new Error('Hindi maaaring markahang consumable habang may pending o naka-issue pang quantity. Ibalik muna ang mga ito.'), { status: 409 });
    }
    const tagCountResult = await client.query(
      'SELECT COUNT(*)::INTEGER AS count FROM asset_unit_tags WHERE item_id = $1',
      [id],
    );
    const existingTagCount = Number(tagCountResult.rows[0]?.count || 0);
    if (trackingModeChanged) {
      const issuanceHistoryResult = await client.query(
        'SELECT EXISTS (SELECT 1 FROM employee_issuances WHERE item_id = $1) AS used',
        [id],
      );
      const optionalTables = await client.query(
        `SELECT to_regclass('public.service_request_assets') IS NOT NULL AS has_request_assets,
                to_regclass('public.asset_movements') IS NOT NULL AS has_asset_movements`,
      );
      let hasRequesterHistory = false;
      let hasMovementHistory = false;
      if (optionalTables.rows[0]?.has_request_assets) {
        const result = await client.query(
          'SELECT EXISTS (SELECT 1 FROM service_request_assets WHERE item_id = $1) AS used',
          [id],
        );
        hasRequesterHistory = Boolean(result.rows[0]?.used);
      }
      if (optionalTables.rows[0]?.has_asset_movements) {
        const result = await client.query(
          'SELECT EXISTS (SELECT 1 FROM asset_movements WHERE item_id = $1) AS used',
          [id],
        );
        hasMovementHistory = Boolean(result.rows[0]?.used);
      }
      if (existingTagCount > 0
        || issuanceHistoryResult.rows[0]?.used
        || hasRequesterHistory
        || hasMovementHistory) {
        throw Object.assign(new Error('Hindi na mababago ang tracking mode matapos magkaroon ng asset tags o issuance history ang item.'), { status: 409 });
      }
    }
    if (nextTrackingMode === 'individual'
      && existingTagCount > 0
      && item.quantity !== Number(previous.quantity)) {
      throw Object.assign(new Error('Magdagdag ng bagong item record sa halip na baguhin ang quantity ng item na may barcode tags na.'), { status: 409 });
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
              condition = $13,
              tracking_mode = $14,
              issue_behavior = $15,
              serial_number = CASE WHEN $14 = 'quantity' THEN NULL ELSE inventory_item.serial_number END
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
        nextTrackingMode,
        nextIssueBehavior,
      ],
    );
    if (!updateResult.rows[0]) {
      throw Object.assign(new Error('Hindi na makita ang piniling category. I-refresh ang page at pumili muli.'), {
        code: 'CATEGORY_NOT_FOUND',
      });
    }

    if (nextTrackingMode === 'individual') {
      await client.query(
        `UPDATE asset_unit_tags
            SET condition = $2, updated_at = NOW()
          WHERE item_id = $1
            AND custody_status = 'Available'
            AND lifecycle_status <> 'Disposed'
            AND issuance_id IS NULL`,
        [id, item.condition],
      );
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
          trackingMode: updated.trackingMode,
          issueBehavior: updated.issueBehavior,
        }),
        changedByUserId,
      ],
    );

    const itemWithHistory = await getItemById(client, id);
    await client.query('COMMIT');
    return {
      ...itemWithHistory,
      stockIncreaseQuantity: Math.max(0, Number(itemWithHistory.quantity) - Number(previous.quantity)),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
async function restockItem(id, receipt) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const itemResult = await client.query(
      'SELECT * FROM item_catalog WHERE id = $1 FOR UPDATE',
      [id],
    );
    const previous = itemResult.rows[0];
    if (!previous) throw Object.assign(new Error('Hindi na makita ang inventory item.'), { status: 404 });
    if (previous.tracking_mode !== 'quantity') {
      throw Object.assign(new Error('Mga item na naka-track as quantity lamang ang maaaring i-restock sa SKU na ito.'), { status: 409 });
    }
    if (previous.condition !== receipt.condition) {
      throw Object.assign(new Error('Magkaiba ang condition ng kasalukuyang stock na naka-track as quantity at bagong delivery. Gumawa ng hiwalay na stock record.'), { status: 409 });
    }

    const previousQuantity = Number(previous.quantity);
    const nextQuantity = previousQuantity + receipt.quantity;
    if (!Number.isInteger(nextQuantity) || nextQuantity > 2147483647) {
      throw Object.assign(new Error('Lampas sa pinapayagang inventory quantity ang restock.'), { status: 400 });
    }
    const receiptTotal = Math.round((receipt.quantity * receipt.unitCost + Number.EPSILON) * 100) / 100;
    const acquisitionCost = Math.round((Number(previous.acquisition_cost) + receiptTotal + Number.EPSILON) * 100) / 100;
    if (!Number.isFinite(acquisitionCost) || acquisitionCost > 9999999999.99) {
      throw Object.assign(new Error('Acquisition cost ay lampas sa pinapayagang halaga.'), { status: 400 });
    }
    const unitCost = Math.round((acquisitionCost / nextQuantity + Number.EPSILON) * 100) / 100;
    const currentValue = previous.current_value === null
      ? null
      : Math.round((Number(previous.current_value) + receiptTotal + Number.EPSILON) * 100) / 100;
    if (currentValue !== null && currentValue > acquisitionCost) {
      throw Object.assign(new Error('Current assessed value cannot exceed the updated acquisition cost.'), { status: 400 });
    }

    await client.query(
      `UPDATE item_catalog
          SET quantity = $2,
              unit_cost = $3,
              acquisition_cost = $4,
              current_value = $5,
              date_acquired = COALESCE(date_acquired, $6),
              time_acquired = COALESCE(time_acquired, $7)
        WHERE id = $1`,
      [id, nextQuantity, unitCost, acquisitionCost, currentValue, receipt.dateAcquired, receipt.timeAcquired],
    );
    await insertInventoryReceipt(client, id, {
      quantity: receipt.quantity,
      unitCost: receipt.unitCost,
      acquisitionCost: receiptTotal,
      dateAcquired: receipt.dateAcquired,
      timeAcquired: receipt.timeAcquired,
      receiptReference: receipt.receiptReference,
      createdByUserId: receipt.recordedByUserId,
    });

    const updatedItem = await getItemById(client, id);
    await client.query(
      `INSERT INTO inventory_change_logs (
         entity_type, entity_key, entity_name, item_id, action, reason,
         old_values, new_values, changed_by_user_id
       ) VALUES ('item', $1, $2, $3, 'updated', $4, $5::JSONB, $6::JSONB, $7)`,
      [
        String(id),
        updatedItem.itemName,
        id,
        `Quantity-tracked stock restocked with ${receipt.quantity} ${previous.unit_of_measure}.`,
        JSON.stringify(itemSnapshot(previous)),
        JSON.stringify({
          itemCode: updatedItem.itemCode,
          trackingMode: updatedItem.trackingMode,
          quantity: updatedItem.quantity,
          unitCost: updatedItem.unitCost,
          acquisitionCost: updatedItem.acquisitionCost,
          currentValue: updatedItem.currentValue,
          receiptQuantity: receipt.quantity,
          receiptUnitCost: receipt.unitCost,
          receiptTotalCost: receiptTotal,
          receiptReference: receipt.receiptReference,
        }),
        receipt.recordedByUserId,
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
         old_values, new_values, changed_by_user_id, flag
       ) VALUES ('category', $1, $2, $3, 'deleted', $4, $5::JSONB, '{}'::JSONB, $6, 'RECORD_DELETED')`,
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

async function listCategoryItemNames() {
  const result = await pool.query(
    `SELECT item_name.id,
            item_name.category_id AS "categoryId",
            category.name AS category,
            item_name.name,
            item_name.approval_policy AS "approvalPolicy",
            item_name.staff_issue_max_quantity AS "staffIssueMaxQuantity",
            item_name.policy_updated_at AS "policyUpdatedAt",
            editor.name AS "policyUpdatedBy",
            item_name.created_at AS "createdAt"
       FROM item_category_item_names AS item_name
       JOIN item_categories AS category ON category.id = item_name.category_id
       LEFT JOIN users AS editor ON editor.id = item_name.policy_updated_by_user_id
      ORDER BY lower(category.name), lower(item_name.name), item_name.id`,
  );
  return result.rows;
}


async function createCategoryItemName(categoryId, { name, createdByUserId }) {
  const result = await pool.query(
    `INSERT INTO item_category_item_names (category_id, name, created_by_user_id)
     SELECT category.id, $2, $3
       FROM item_categories AS category
      WHERE category.id = $1
     RETURNING id, category_id AS "categoryId", name, created_at AS "createdAt"`,
    [categoryId, name, createdByUserId],
  );
  if (!result.rows[0]) {
    throw Object.assign(new Error('Hindi na makita ang piniling category.'), { code: 'CATEGORY_NOT_FOUND' });
  }
  return result.rows[0];
}

async function deleteCategoryItemName(id) {
  const result = await pool.query(
    `DELETE FROM item_category_item_names
      WHERE id = $1
      RETURNING id, category_id AS "categoryId", name, created_at AS "createdAt"`,
    [id],
  );
  if (!result.rows[0]) {
    throw Object.assign(new Error('Hindi na makita ang item name na buburahin.'), { status: 404 });
  }
  return result.rows[0];
}

module.exports = {
  listItems,
  createItem,
  createItems,
  restockItem,
  updateItem,
  listCategories,
  createCategory,
  renameCategory,
  deleteCategory,
  listCategoryItemNames,
  createCategoryItemName,
  deleteCategoryItemName,
};
