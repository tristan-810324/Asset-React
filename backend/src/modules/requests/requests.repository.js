const pool = require('../../config/db');
const { getAvailableQuantity, refreshInventoryStatus } = require('../inventory/inventory.stock');
const { staffRouteOptions, nextRequisitionStatus, nameMatch } = require('./requisition-routing');
const { recordFacilityReturn } = require('./facility-flow.repository');
const serviceWorkOrdersRepository = require('./service-work-orders.repository');

const httpError = (status, message) => Object.assign(new Error(message), { status });

const REQUEST_SELECT = `
  SELECT request.id,
         request.reference_no AS "referenceNo",
         request.request_type AS "requestType",
         request.title,
         request.form_data AS "formData",
         request.status,
         request.created_at AS "createdAt",
         request.updated_at AS "updatedAt",
         request.completed_at AS "completedAt",
         request.gso_head_endorsed_by_user_id AS "gsoHeadEndorsedByUserId",
         request.gso_head_endorsed_at AS "gsoHeadEndorsedAt",
         request.finance_email AS "financeEmail",
         request.finance_sent_at AS "financeSentAt",
         request.finance_message_id AS "financeMessageId",
         request.staff_reviewed_at AS "staffReviewedAt",
         request.staff_review_note AS "staffReviewNote",
         (SELECT reviewer.name FROM users AS reviewer WHERE reviewer.id = request.staff_reviewed_by_user_id) AS "staffReviewedBy",
         (SELECT endorser.name FROM users AS endorser WHERE endorser.id = request.gso_head_endorsed_by_user_id) AS "gsoHeadEndorsedByName",
         (SELECT endorser.email FROM users AS endorser WHERE endorser.id = request.gso_head_endorsed_by_user_id) AS "gsoHeadEndorsedByEmail",
         requester.id AS "requesterId",
         requester.name AS "requesterName",
         requester.email AS "requesterEmail",
         -- First and last name: the linked employee record first, then the name on the identity form.
         (SELECT NULLIF(trim(concat_ws(' ',
                   COALESCE(NULLIF(trim(employee.first_name), ''), NULLIF(trim(profile.first_name), '')),
                   COALESCE(NULLIF(trim(employee.last_name), ''), NULLIF(trim(profile.last_name), '')))), '')
            FROM requester_identity_profiles AS profile
            LEFT JOIN employees AS employee ON lower(employee.employee_code) = lower(profile.employee_code)
           WHERE profile.user_id = request.requested_by_user_id
           LIMIT 1) AS "requesterFullName",
         request.slip_printed_at AS "slipPrintedAt",
         (SELECT printer.name FROM users AS printer WHERE printer.id = request.slip_printed_by_user_id) AS "slipPrintedBy",
         COALESCE((
           SELECT json_agg(json_build_object(
             'id', asset.id,
             'itemId', asset.item_id,
             'itemCode', item.item_code,
             'itemName', COALESCE(NULLIF(item.item_name, ''), item.description),
             'quantity', asset.quantity,
             'unitOfMeasure', asset.unit_of_measure,
             'conditionOut', asset.condition_out,
             'conditionIn', asset.condition_in,
             'dueDate', to_char(asset.due_date, 'YYYY-MM-DD'),
             'issuedAt', asset.issued_at,
             'returnedAt', asset.returned_at,
             'returnedQuantity', asset.returned_quantity,
             'damagedQuantity', asset.damaged_quantity,
             'repairedQuantity', asset.repaired_quantity,
             'unserviceableQuantity', asset.unserviceable_quantity,
             'repairOwner', asset.repair_owner,
             'lostQuantity', asset.lost_quantity,
             'returnedByUserId', asset.returned_by_user_id::TEXT,
             'settlementStatus', asset.settlement_status,
             'writeOffReason', asset.write_off_reason,
             'writeOffDecision', asset.write_off_decision,
             'writeOffEstimatedValue', asset.write_off_estimated_value,
             'writeOffAt', asset.write_off_at,
             'settlementNote', asset.settlement_note,
             'settledAt', asset.settled_at,
             'settledBy', (SELECT settler.name FROM users AS settler WHERE settler.id = asset.settled_by_user_id)
           ) ORDER BY asset.id)
             FROM service_request_assets AS asset
             JOIN item_catalog AS item ON item.id = asset.item_id
            WHERE asset.request_id = request.id
         ), '[]'::json) AS assets,
         COALESCE((
           SELECT json_agg(json_build_object(
             'id', event.id,
             'previousStatus', event.previous_status,
             'status', event.new_status,
             'note', event.note,
             'changedBy', editor.name,
             'changedAt', event.changed_at
           ) ORDER BY event.changed_at, event.id)
             FROM service_request_history AS event
             LEFT JOIN users AS editor ON editor.id = event.changed_by_user_id
            WHERE event.request_id = request.id
         ), '[]'::json) AS history
         , (EXISTS (
             SELECT 1 FROM asset_unit_tags AS tag
               JOIN employee_issuances AS issue ON issue.id = tag.issuance_id
               JOIN employee_issuance_batches AS batch ON batch.id = issue.batch_id
              WHERE batch.purchase_requisition_id = request.id)
           AND NOT EXISTS (
             SELECT 1 FROM asset_unit_tags AS tag
               JOIN employee_issuances AS issue ON issue.id = tag.issuance_id
               JOIN employee_issuance_batches AS batch ON batch.id = issue.batch_id
              WHERE batch.purchase_requisition_id = request.id AND tag.label_printed_at IS NULL)) AS "labelsAllPrinted"
         , COALESCE((
           SELECT json_agg(json_build_object(
             'id', return_record.id::TEXT,
             'itemName', COALESCE(NULLIF(inventory.item_name, ''), inventory.description),
             'itemCode', inventory.item_code,
             'tagCode', COALESCE(return_record.tag_snapshot->>'tagCode', tag.tag_code),
             'quantity', return_record.quantity,
             'unitOfMeasure', issue.unit_of_measure,
             'employeeName', trim(concat_ws(' ', staff.first_name, staff.middle_name, staff.last_name, staff.suffix)),
             'condition', return_record.return_condition,
             'status', return_record.status,
             'returnedAt', COALESCE(return_record.decided_at, return_record.requested_at)
           ) ORDER BY COALESCE(return_record.decided_at, return_record.requested_at) DESC, return_record.id DESC)
             FROM purchase_requisition_lines AS line
             JOIN employee_issuances AS issue ON issue.purchase_requisition_line_id = line.id
             JOIN employee_issuance_returns AS return_record ON return_record.issuance_id = issue.id
             JOIN item_catalog AS inventory ON inventory.id = issue.item_id
             JOIN employees AS staff ON staff.id = issue.employee_id
             LEFT JOIN asset_unit_tags AS tag ON tag.id = return_record.asset_unit_tag_id
            WHERE line.request_id = request.id
              AND return_record.status NOT IN ('Voided', 'Lost')
         ), '[]'::json) AS "returnedItems"
         ,COALESCE((
           SELECT json_agg(json_build_object(
             'id', line.id::TEXT,
             'lineNumber', line.line_number,
             'itemNameId', line.item_name_id::TEXT,
             'category', line.category,
             'itemName', line.item_name,
             'specifications', line.specifications,
             'requestedQuantity', line.requested_quantity,
             'approvalPolicy', line.approval_policy,
             'staffIssueMaxQuantity', line.staff_issue_max_quantity,
             'reservedQuantity', line.reserved_quantity,
             'financeQuantity', line.finance_quantity,
             'issuedQuantity', line.issued_quantity,
             'routeStatus', line.route_status,
             'reviewNote', line.review_note,
             'pendingBatchId', (
               SELECT batch.id::TEXT
                 FROM employee_issuances AS pending_issue
                 JOIN employee_issuance_batches AS batch ON batch.id = pending_issue.batch_id
                WHERE pending_issue.purchase_requisition_line_id = line.id
                  AND pending_issue.status = 'Pending'
                ORDER BY batch.requested_at DESC, batch.id DESC
                LIMIT 1
             ),
              'issuedRecipients', COALESCE((
                SELECT json_agg(json_build_object(
                  'employeeCode', employee.employee_code,
                  'employeeName', trim(concat_ws(' ', employee.first_name, employee.middle_name, employee.last_name, employee.suffix)),
                  'quantity', issue.quantity,
                  'useLocation', issue.recipient_location,
                  'purpose', issue.recipient_purpose
                ) ORDER BY issue.id)
                  FROM employee_issuances AS issue
                  JOIN employees AS employee ON employee.id = issue.employee_id
                 WHERE issue.purchase_requisition_line_id = line.id
                   AND issue.status IN ('Issued', 'Returned')
              ), '[]'::JSON),
             'allocations', COALESCE((
               SELECT json_agg(json_build_object(
                 'id', allocation.id::TEXT,
                 'itemId', item.id::TEXT,
                 'itemCode', item.item_code,
                 'inventoryName', COALESCE(NULLIF(item.item_name, ''), item.description),
                 'description', item.description,
                 'quantity', allocation.quantity,
                 'fulfilledQuantity', allocation.fulfilled_quantity,
                 'status', allocation.status,
                 'unitOfMeasure', item.unit_of_measure
               ) ORDER BY item.id)
                 FROM purchase_requisition_line_allocations AS allocation
                 JOIN item_catalog AS item ON item.id = allocation.item_id
                WHERE allocation.line_id = line.id
             ), '[]'::JSON),
             -- Each purchased delivery GSO Staff linked to this item: what, how many, receipt, who, and when.
             'receipts', COALESCE((
               SELECT json_agg(json_build_object(
                 'id', receipt.id::TEXT,
                 'itemCode', item.item_code,
                 'inventoryName', COALESCE(NULLIF(item.item_name, ''), item.description),
                 'quantity', receipt.quantity,
                 'unitOfMeasure', item.unit_of_measure,
                 'receiptReference', receipt.receipt_reference,
                 'receivedBy', staff.name,
                 'receivedAt', receipt.received_at,
                 'voidedAt', receipt.voided_at,
                 'voidedBy', voider.name
               ) ORDER BY receipt.received_at, receipt.id)
                 FROM purchase_requisition_line_receipts AS receipt
                 JOIN item_catalog AS item ON item.id = receipt.item_id
                 LEFT JOIN users AS staff ON staff.id = receipt.received_by_user_id
                 LEFT JOIN users AS voider ON voider.id = receipt.voided_by_user_id
                WHERE receipt.line_id = line.id
             ), '[]'::JSON)
           ) ORDER BY line.line_number)
             FROM purchase_requisition_lines AS line
            WHERE line.request_id = request.id
         ), '[]'::JSON) AS "purchaseLines"
    FROM service_requests AS request
    JOIN users AS requester ON requester.id = request.requested_by_user_id`;

async function listAssets({ includeUnstocked = false } = {}) {
  const result = await pool.query(
    `SELECT item.id,
            item.item_code AS "itemCode",
            COALESCE(NULLIF(item.item_name, ''), item.description) AS name,
            item.category,
            item.description,
            item.condition,
            item.unit_of_measure AS "unitOfMeasure",
            item.tracking_mode AS "trackingMode",
            item.issue_behavior AS "issueBehavior",
            GREATEST(item.quantity - COALESCE(employee_usage.active_quantity, 0) - COALESCE(borrower_usage.active_quantity, 0) - COALESCE(repair_usage.repair_quantity, 0), 0)::INTEGER AS "availableQuantity"
       FROM item_catalog AS item
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(issue.quantity) FILTER (WHERE issue.status = 'Pending'), 0)
              + COALESCE(SUM(issue.quantity - issue.returned_quantity) FILTER (WHERE issue.status = 'Issued'), 0)
              + COALESCE((SELECT SUM(allocation.quantity - allocation.fulfilled_quantity)
                            FROM purchase_requisition_line_allocations AS allocation
                           WHERE allocation.item_id = item.id AND allocation.status = 'Reserved'), 0) AS active_quantity
           FROM employee_issuances AS issue
          WHERE issue.item_id = item.id AND issue.status IN ('Pending', 'Issued')
       ) AS employee_usage ON TRUE
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(asset.quantity - CASE WHEN request.status = 'For Repair' THEN COALESCE(asset.returned_quantity, 0) ELSE 0 END), 0) AS active_quantity
           FROM service_request_assets AS asset
           JOIN service_requests AS request ON request.id = asset.request_id
          WHERE asset.item_id = item.id
            AND request.status IN ('Approved', 'Ready for Pickup', 'Issued', 'Return Requested', 'For Repair')
       ) AS borrower_usage ON TRUE
       -- Same rule as the Item Master: units waiting in To Be Repaired are held, tagged units count their own repair state.
       LEFT JOIN LATERAL (
         SELECT CASE WHEN COUNT(tag.id) = 0 THEN item.repair_quantity
                     ELSE COUNT(tag.id) FILTER (WHERE tag.custody_status = 'Available' AND tag.lifecycle_status <> 'Disposed'
                                                  AND tag.condition IN ('Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired'))
                END AS repair_quantity
           FROM asset_unit_tags AS tag
          WHERE tag.item_id = item.id
       ) AS repair_usage ON TRUE
      WHERE (item.quantity > 0 OR $1::BOOLEAN)
        AND item.condition NOT IN ('Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired')
      ORDER BY lower(COALESCE(NULLIF(item.item_name, ''), item.description)), item.id`,
    [includeUnstocked],
  );
  // Items out of stock stay in the list. Items never stocked (quantity 0) are left out unless the caller asks for them,
  // as the facilities request does.
  return result.rows;
}

async function listPurchaseItemNames() {
  const result = await pool.query(
    `SELECT item_name.id,
            item_name.name,
            category.name AS category,
            item_name.approval_policy AS "approvalPolicy",
            item_name.staff_issue_max_quantity AS "staffIssueMaxQuantity"
       FROM item_category_item_names AS item_name
       JOIN item_categories AS category ON category.id = item_name.category_id
      ORDER BY lower(category.name), lower(item_name.name), item_name.id`,
  );
  return result.rows;
}

async function listPurchaseItemNamesByIds(ids) {
  if (!ids.length) return [];
  const result = await pool.query(
    `SELECT item_name.id,
            item_name.name,
            category.name AS category,
            item_name.approval_policy AS "approvalPolicy",
            item_name.staff_issue_max_quantity AS "staffIssueMaxQuantity"
       FROM item_category_item_names AS item_name
       JOIN item_categories AS category ON category.id = item_name.category_id
      WHERE item_name.id = ANY($1::BIGINT[])`,
    [ids],
  );
  return result.rows;
}

async function listCatalogItemsByIds(ids) {
  if (!ids.length) return [];
  const result = await pool.query(
    `SELECT item.id,
            item.item_code AS "itemCode",
            COALESCE(NULLIF(item.item_name, ''), item.description) AS name,
            item.category,
            item.description,
            item.condition,
            item.inventory_status AS "inventoryStatus",
            COALESCE(item_name.approval_policy, 'GSO_HEAD') AS "approvalPolicy",
            item_name.staff_issue_max_quantity AS "staffIssueMaxQuantity"
       FROM item_catalog AS item
       LEFT JOIN item_categories AS category ON lower(category.name) = lower(item.category)
       LEFT JOIN item_category_item_names AS item_name
         ON item_name.category_id = category.id AND lower(trim(item_name.name)) = lower(trim(COALESCE(NULLIF(item.item_name, ''), item.description)))
      WHERE item.id = ANY($1::BIGINT[])`,
    [ids],
  );
  return result.rows;
}

async function getById(queryable, id) {
  const result = await (queryable || pool).query(`${REQUEST_SELECT} WHERE request.id = $1`, [id]);
  return result.rows[0] || null;
}

async function listMine(userId) {
  const result = await pool.query(
    `${REQUEST_SELECT}
      WHERE request.requested_by_user_id = $1
      ORDER BY request.created_at DESC, request.id DESC
      LIMIT 100`,
    [userId],
  );
  return result.rows;
}

async function getMineById(id, userId) {
  const result = await pool.query(
    `${REQUEST_SELECT} WHERE request.id = $1 AND request.requested_by_user_id = $2`,
    [id, userId],
  );
  return result.rows[0] || null;
}

async function listAll({ requestType, status, search }) {
  const values = [];
  // Requisitions have their own GSO Staff page, so the general inbox leaves them out.
  const filters = ["request.request_type <> 'PURCHASE_REQUISITION'"];
  if (requestType) {
    values.push(requestType);
    filters.push(`request.request_type = $${values.length}`);
  }
  if (status) {
    values.push(status);
    filters.push(`request.status = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    const parameter = `$${values.length}`;
    filters.push(`(request.reference_no ILIKE ${parameter} OR request.title ILIKE ${parameter} OR requester.name ILIKE ${parameter} OR requester.email ILIKE ${parameter} OR request.form_data::TEXT ILIKE ${parameter})`);
  }
  const result = await pool.query(
    `${REQUEST_SELECT}
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      ORDER BY request.created_at DESC, request.id DESC
      LIMIT 250`,
    values,
  );
  return result.rows;
}

async function listPurchaseRequisitions({ status, search }) {
  const values = [];
  const filters = ["request.request_type = 'PURCHASE_REQUISITION'"];
  if (status) {
    values.push(status);
    filters.push(`request.status = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    const parameter = `$${values.length}`;
    filters.push(`(request.reference_no ILIKE ${parameter} OR request.title ILIKE ${parameter} OR requester.name ILIKE ${parameter} OR requester.email ILIKE ${parameter} OR request.form_data::TEXT ILIKE ${parameter})`);
  }
  const result = await pool.query(
    `${REQUEST_SELECT}
      WHERE ${filters.join(' AND ')}
      ORDER BY CASE request.status
                 WHEN 'Submitted' THEN 0
                 WHEN 'Under Review' THEN 1
                 WHEN 'Approved' THEN 2
                 WHEN 'Finance Handoff Failed' THEN 3
                 WHEN 'GSO Endorsed' THEN 4
                 WHEN 'Finance Handoff Pending' THEN 5
                 WHEN 'Sent to Finance' THEN 6
                 ELSE 6
               END,
               request.created_at DESC, request.id DESC
      LIMIT 250`,
    values,
  );
  return result.rows;
}

async function listStaffPurchaseRequisitions() {
  const result = await pool.query(
    `${REQUEST_SELECT}
      WHERE request.request_type = 'PURCHASE_REQUISITION'
        AND request.status <> 'Cancelled'
      ORDER BY CASE WHEN request.status = 'Submitted' THEN 0 ELSE 1 END,
               request.updated_at DESC, request.id DESC
      LIMIT 250`,
  );
  return result.rows;
}

// Consolidates approved, still-outstanding shortages across requisitions while
// retaining each request's quantity and physical Finance handoff state.
async function listItemsToBuy() {
  const result = await pool.query(
    `WITH request_item_totals AS (
       SELECT request.id AS "requestId",
              request.reference_no AS "referenceNo",
              requester.name AS "requesterName",
              COALESCE(NULLIF(trim(request.form_data->>'departmentOrganization'), ''), 'Department not set') AS department,
              request.status,
              request.finance_sent_at AS "financeHandoffAt",
              lower(trim(line.category)) AS category_key,
              lower(trim(line.item_name)) AS item_key,
              lower(trim(COALESCE(line.specifications, ''))) AS specifications_key,
              min(line.category) AS category,
              min(line.item_name) AS "itemName",
              min(line.specifications) AS specifications,
              sum(line.finance_quantity)::INTEGER AS quantity
         FROM purchase_requisition_lines AS line
         JOIN service_requests AS request ON request.id = line.request_id
         JOIN users AS requester ON requester.id = request.requested_by_user_id
        WHERE request.request_type = 'PURCHASE_REQUISITION'
          AND request.status IN ('GSO Endorsed', 'Finance Handoff Pending', 'Finance Handoff Failed', 'Sent to Finance')
          AND request.gso_head_endorsed_by_user_id IS NOT NULL
          AND line.finance_quantity > 0
        GROUP BY request.id, request.reference_no, requester.name,
                 request.form_data->>'departmentOrganization', request.status,
                 request.finance_sent_at, lower(trim(line.category)),
                 lower(trim(line.item_name)), lower(trim(COALESCE(line.specifications, '')))
     )
     SELECT min(category) AS category,
            min("itemName") AS "itemName",
            min(specifications) AS specifications,
            sum(quantity)::INTEGER AS "totalQuantity",
            count(*)::INTEGER AS "requestCount",
            json_agg(json_build_object(
              'requestId', "requestId"::TEXT,
              'referenceNo', "referenceNo",
              'requesterName', "requesterName",
              'department', department,
              'quantity', quantity,
              'status', status,
              'financeHandoffAt', "financeHandoffAt"
            ) ORDER BY "referenceNo") AS requests
       FROM request_item_totals
      GROUP BY category_key, item_key, specifications_key
      ORDER BY "totalQuantity" DESC, lower(min("itemName")), min(category)`,
  );
  return result.rows;
}

// Inventory records that are the requested item (same name, or a similar name GSO Staff confirm), and how many units
// each can still give. A laptop is never offered for a hard drive, even when both are in the same category.
// `consumed` carries units already planned for earlier items of the same request in a preview.
async function checkLineStock(queryable, line, { lock = false, consumed = new Map() } = {}) {
  const candidates = await queryable.query(
    `SELECT item.id, item.item_code, COALESCE(NULLIF(item.item_name, ''), item.description) AS name,
            item.description, item.category, item.quantity, item.unit_of_measure,
            item.condition, item.location AS storage_location, item.date_acquired, item.unit_cost
       FROM item_catalog AS item
      WHERE item.quantity > 0
        AND item.condition NOT IN ('Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired')
      ORDER BY item.id
      ${lock ? 'FOR UPDATE OF item' : ''}`,
  );
  const requestedQuantity = Number(line.requestedQuantity);
  const matches = [];
  // The preview passes mapped lines (itemName), the routing step passes raw rows (item_name).
  const requestedName = line.itemName ?? line.item_name;
  for (const item of candidates.rows) {
    if (!nameMatch(requestedName, item.name)) continue;
    const itemId = String(item.id);
    const availableQuantity = Math.max(0, await getAvailableQuantity(queryable, item) - (consumed.get(itemId) || 0));
    if (availableQuantity < 1) continue;
    matches.push({
      itemId, itemCode: item.item_code, name: item.name, description: item.description || '', unitOfMeasure: item.unit_of_measure,
      availableQuantity, reserveQuantity: 0,
      condition: item.condition, storageLocation: item.storage_location || '', dateAcquired: item.date_acquired, unitCost: Number(item.unit_cost) || 0,
    });
  }
  const availableQuantity = matches.reduce((total, match) => total + match.availableQuantity, 0);
  const options = staffRouteOptions({
    requestedQuantity,
    availableQuantity,
    approvalPolicy: line.approvalPolicy,
    staffIssueMaxQuantity: line.staffIssueMaxQuantity,
  });
  // Issue now takes what is in stock, so it is judged on the full request, not on the matched part.
  const issueAllowed = staffRouteOptions({ requestedQuantity, availableQuantity: requestedQuantity, approvalPolicy: line.approvalPolicy, staffIssueMaxQuantity: line.staffIssueMaxQuantity }).includes('ISSUE');
  return { route: options[0], options, availableQuantity, reservedQuantity: 0, matches, issueAllowed };
}

// Adds a stock check to every item GSO Staff still has to route, in line order, as routing would reserve it.
async function attachStaffStockChecks(requests) {
  for (const request of requests) {
    if (request.status !== 'Submitted') continue;
    const consumed = new Map();
    for (const line of request.purchaseLines || []) {
      if (line.routeStatus === 'WAITING_STAFF_REVIEW') line.stockCheck = await checkLineStock(pool, line, { consumed });
    }
  }
  return requests;
}

function staffRouteSummary(counts, note) {
  const total = counts.ISSUE + counts.HEAD_ISSUE + counts.PURCHASE;
  const parts = [];
  if (counts.REJECT > 0) parts.push(`${counts.REJECT} consumable line(s) rejected`);
  if (counts.PURCHASE > 0) {
    parts.push(`${counts.PURCHASE} item line(s) have a shortage`);
    if (counts.HEAD_ISSUE > 0) parts.push(`${counts.HEAD_ISSUE} stocked item line(s) are held`);
  } else if (counts.HEAD_ISSUE > 0) {
    parts.push(`GSO Head approval covers all ${total} item line(s)`);
  } else if (counts.ISSUE > 0) {
    parts.push(`${counts.ISSUE} item line(s) reserved now; GSO Staff issue them in Main Issuance`);
  }
  const destination = total === 0
    ? 'Nothing is left to route.'
    : counts.PURCHASE > 0 || counts.HEAD_ISSUE > 0
      ? counts.ISSUE > 0
        ? 'The in-stock items are reserved now; GSO Staff issue them in Main Issuance. The rest waits for the GSO Head as one package.'
        : 'The entire request is waiting for the GSO Head as one package.'
      : counts.ISSUE > 0 ? 'The reserved items are ready in Main Issuance.' :'The entire request is ready for GSO Staff issuance.';
  return `GSO Staff checked the complete request: ${parts.filter(Boolean).join('; ')}. ${destination}${note ? ` Note: ${note}` : ''}`;
}

async function staffReviewPurchaseRequisition({ id, action, note, selectedUnits = {}, issueNowLineIds = [], rejectLineIds = [], changedBy }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = (await client.query(
      'SELECT id, request_type, status, form_data FROM service_requests WHERE id = $1 FOR UPDATE',
      [id],
    )).rows[0];
    if (!current || current.request_type !== 'PURCHASE_REQUISITION') throw httpError(404, 'Purchase requisition not found.');
    const lines = (await client.query(
      `SELECT * FROM purchase_requisition_lines
        WHERE request_id = $1 AND route_status = 'WAITING_STAFF_REVIEW'
        ORDER BY line_number
        FOR UPDATE`,
      [id],
    )).rows;
    if (current.status !== 'Submitted' || lines.length === 0) {
      throw httpError(409, 'This requisition was already reviewed. Refresh the list.');
    }

    let historyNote;
    if (action === 'NEEDS_INFORMATION') {
      await client.query(
        `UPDATE purchase_requisition_lines
            SET route_status = 'NEEDS_INFORMATION', review_note = $2, updated_at = NOW()
          WHERE request_id = $1 AND route_status = 'WAITING_STAFF_REVIEW'`,
        [id, note],
      );
      historyNote = `GSO Staff asked the requester for more details: ${note}`;
    } else {
      const counts = { ISSUE: 0, HEAD_ISSUE: 0, PURCHASE: 0, REJECT: 0 };
      // Release every line first, then reserve only the units GSO Staff picked as matching the requester's specs.
      for (const line of lines) await releasePurchaseLineStock(client, line.id);

      const consumed = new Map();
      for (const line of lines) {
        // A rejected consumable reserves nothing; its reason stays on the line for the requester.
        if (rejectLineIds.includes(String(line.id))) {
          const kind = (current.form_data?.items || [])[Number(line.line_number) - 1]?.itemKind;
          if (kind !== 'CONSUMABLE') throw httpError(409, `${line.item_name} is a per-unit item. Send it to the GSO Head instead.`);
          if (issueNowLineIds.includes(String(line.id))) throw httpError(409, `${line.item_name} cannot be issued now and rejected at the same time.`);
          counts.REJECT += 1;
          await client.query(
            `UPDATE purchase_requisition_lines
                SET route_status = 'REJECTED', reserved_quantity = 0, finance_quantity = 0, review_note = $2, updated_at = NOW()
              WHERE id = $1`,
            [line.id, note],
          );
          continue;
        }
        const requested = Number(line.requested_quantity);
        const check = await checkLineStock(client, line, { lock: true, consumed });
        let remaining = requested;
        const chosen = [];
        for (const itemId of selectedUnits[String(line.id)] || []) {
          const match = check.matches.find((entry) => entry.itemId === String(itemId));
          if (!match) throw httpError(409, `The stock for ${line.item_name} changed. Refresh and check again before you route.`);
          const quantity = Math.min(match.availableQuantity, remaining);
          if (quantity < 1) continue;
          chosen.push({ itemId: match.itemId, quantity });
          consumed.set(match.itemId, (consumed.get(match.itemId) || 0) + quantity);
          remaining -= quantity;
        }
        const reserved = requested - remaining;
        // A consumable with some units in stock, within the item's own staff limit, can be issued now.
        const issuesNow = issueNowLineIds.includes(String(line.id));
        if (issuesNow) {
          const kind = (current.form_data?.items || [])[Number(line.line_number) - 1]?.itemKind;
          // The staff limit is judged on the full request; the units in stock may be fewer than requested.
          // The item's policy decides whether GSO Staff may issue now: a STAFF_ISSUE item can, a GSO_HEAD item always goes to the Head.
          // A per-unit item also needs its full quantity in stock; the audit log records it.
          const perUnit = kind === 'PER_UNIT';
          const routes = staffRouteOptions({
            requestedQuantity: requested,
            availableQuantity: requested,
            approvalPolicy: line.approval_policy,
            staffIssueMaxQuantity: line.staff_issue_max_quantity,
          });
          const inStock = perUnit ? reserved >= requested : reserved >= 1;
          if (!['CONSUMABLE', 'PER_UNIT'].includes(kind) || !inStock || !routes.includes('ISSUE')) {
            throw httpError(409, `${line.item_name} cannot be issued now. Send it to the GSO Head instead.`);
          }
        }
        for (const pick of chosen) {
          await client.query(
            `INSERT INTO purchase_requisition_line_allocations (line_id, item_id, quantity)
             VALUES ($1, $2, $3)
             ON CONFLICT (line_id, item_id) DO UPDATE
               SET quantity = EXCLUDED.quantity, fulfilled_quantity = 0, status = 'Reserved', updated_at = NOW()`,
            [line.id, pick.itemId, pick.quantity],
          );
          // The unit's stock status follows its reservations, so the Item Master shows it as Reserved.
          await refreshInventoryStatus(client, pick.itemId);
        }
        if (issuesNow) {
          counts.ISSUE += 1;
          // Only the units in stock are issued: the line keeps that quantity, and the rest becomes a declined line below.
          await client.query(
            `UPDATE purchase_requisition_lines
                SET requested_quantity = $2, route_status = 'READY_FOR_STAFF', reserved_quantity = $2, finance_quantity = 0, review_note = '', updated_at = NOW()
              WHERE id = $1`,
            [line.id, reserved],
          );
          if (reserved < requested) {
            counts.REJECT += 1;
            await client.query(
              `INSERT INTO purchase_requisition_lines (request_id, line_number, item_name_id, category, item_name, specifications, requested_quantity, approval_policy, staff_issue_max_quantity, route_status, review_note)
               SELECT request_id, (SELECT COALESCE(MAX(line_number), 0) + 1 FROM purchase_requisition_lines WHERE request_id = $1), item_name_id, category, item_name, specifications, $3, approval_policy, staff_issue_max_quantity, 'REJECTED', $4
                 FROM purchase_requisition_lines WHERE id = $2`,
              [line.request_id, line.id, requested - reserved, `Sorry, only ${reserved} of ${requested} were in stock and issued now. Please submit a new request for the other ${requested - reserved}.`],
            );
          }
          continue;
        }
        // Matching units go to the GSO Head with the request; any shortfall is part of the purchase.
        counts[reserved < requested ? 'PURCHASE' : 'HEAD_ISSUE'] += 1;
        await client.query(
          `UPDATE purchase_requisition_lines
              SET route_status = 'WAITING_GSO_HEAD', reserved_quantity = $2, finance_quantity = $3, review_note = '', updated_at = NOW()
            WHERE id = $1`,
          [line.id, reserved, requested - reserved],
        );
      }
      historyNote = staffRouteSummary(counts, note);
    }

    const routeStatuses = (await client.query(
      'SELECT route_status FROM purchase_requisition_lines WHERE request_id = $1',
      [id],
    )).rows.map((row) => row.route_status);
    const status = nextRequisitionStatus(routeStatuses, current.status);
    await client.query(
      `UPDATE service_requests
          SET status = $2, staff_reviewed_by_user_id = $3, staff_reviewed_at = NOW(),
              staff_review_note = $4, updated_at = NOW(),
              completed_at = CASE WHEN $2 = 'Rejected' THEN NOW() ELSE completed_at END
        WHERE id = $1`,
      [id, status, changedBy, note],
    );
    await client.query(
      `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, current.status, status, historyNote.slice(0, 2000), changedBy],
    );
    const request = await getById(client, id);
    await client.query('COMMIT');
    return request;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const sumOf = (rows, pick) => rows.reduce((total, row) => total + pick(row), 0);

// Requisition items GSO Staff can link a delivery to now: the GSO Head sent the purchase to Finance, units are
// still to be received, and Item Master Data has available stock under the same or a similar name.
// `itemIds` limits the answer to those inventory records (the check right after a restock). Oldest request first.
async function listAwaitingDeliveries({ itemIds = [] } = {}) {
  const waiting = (await pool.query(
    `SELECT line.id::TEXT AS "lineId", line.category, line.item_name AS "itemName",
            line.requested_quantity AS "requestedQuantity", line.finance_quantity AS "remainingQuantity",
            request.id::TEXT AS "requestId", request.reference_no AS "referenceNo", request.created_at AS "createdAt",
            COALESCE(NULLIF(request.form_data->>'requesterName', ''), requester.name) AS "requesterName",
            COALESCE(request.form_data->>'departmentOrganization', '') AS "department"
       FROM purchase_requisition_lines AS line
       JOIN service_requests AS request ON request.id = line.request_id
       JOIN users AS requester ON requester.id = request.requested_by_user_id
      WHERE request.request_type = 'PURCHASE_REQUISITION'
        AND request.status = 'Sent to Finance'
        AND line.finance_quantity > 0
        AND line.route_status <> 'HANDOVER_PENDING'
      ORDER BY request.created_at, request.id, line.line_number`,
  )).rows;
  if (!waiting.length) return [];

  // A record can only be the same or a similar item when it shares a word with a waiting item's name.
  const words = [...new Set(waiting.flatMap((line) => String(line.itemName).toLowerCase().match(/[a-z0-9]+/g) || []))];
  const values = [words.map((word) => `%${word}%`)];
  if (itemIds.length) values.push(itemIds);
  const inventory = (await pool.query(
    `SELECT item.id, item.item_code, COALESCE(NULLIF(item.item_name, ''), item.description) AS name,
            item.category, item.quantity, item.unit_of_measure
       FROM item_catalog AS item
      WHERE item.quantity > 0
        AND item.condition NOT IN ('Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired')
        AND lower(COALESCE(NULLIF(item.item_name, ''), item.description)) LIKE ANY($1::TEXT[])
        ${itemIds.length ? 'AND item.id = ANY($2::BIGINT[])' : ''}
      ORDER BY item.id`,
    values,
  )).rows;

  const availableById = new Map();
  const availableOf = async (item) => {
    if (!availableById.has(item.id)) availableById.set(item.id, await getAvailableQuantity(pool, item));
    return availableById.get(item.id);
  };
  const lines = [];
  for (const line of waiting) {
    const candidates = [];
    for (const item of inventory) {
      const match = deliveryNameMatch(line.itemName, line.category, item.category, item.name);
      if (!match) continue;
      const availableQuantity = await availableOf(item);
      if (availableQuantity > 0) {
        candidates.push({
          itemId: String(item.id), itemCode: item.item_code, name: item.name, category: item.category,
          unitOfMeasure: item.unit_of_measure, availableQuantity, match,
        });
      }
    }
    // The same name comes first; a similar name is offered only for GSO Staff to confirm.
    candidates.sort((a, b) => (a.match === b.match ? 0 : a.match === 'EXACT' ? -1 : 1));
    if (candidates.length) lines.push({ ...line, candidates });
  }
  return lines;
}

// Units in storage that GSO Staff can pick for this requisition: same category and not reserved for another request.
async function listRequisitionStorageCandidates(requestId) {
  const categories = (await pool.query(
    'SELECT DISTINCT category FROM purchase_requisition_lines WHERE request_id = $1',
    [requestId],
  )).rows.map((row) => row.category);
  const items = (await pool.query(
    `SELECT item.id, item.item_code, COALESCE(NULLIF(item.item_name, ''), item.description) AS name,
            item.description, item.category, item.quantity, item.unit_of_measure
       FROM item_catalog AS item
      WHERE item.quantity > 0
        AND item.condition NOT IN ('Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired')
      ORDER BY item.id`,
  )).rows;
  const units = [];
  for (const item of items) {
    if (!categories.some((category) => purchaseCategoryMatches(category, item.category))) continue;
    const availableQuantity = await getAvailableQuantity(pool, item);
    if (availableQuantity < 1) continue;
    units.push({
      itemId: String(item.id),
      itemCode: item.item_code,
      name: item.name,
      description: item.description || '',
      category: item.category,
      unitOfMeasure: item.unit_of_measure,
      availableQuantity,
    });
  }
  return units;
}

// GSO Staff pick another unit from storage for a ready requisition line. One reserved unit goes back to stock and
// the chosen unit is reserved in its place, so the staff can pick the unit that matches the requester's specs.
async function swapRequisitionUnit({ lineId, fromItemId, toItemId, changedBy }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const line = (await client.query(
      'SELECT id, request_id, item_name, category FROM purchase_requisition_lines WHERE id = $1 FOR UPDATE',
      [lineId],
    )).rows[0];
    if (!line) throw httpError(404, 'Requisition item not found.');
    const request = (await client.query(
      'SELECT id, request_type, status FROM service_requests WHERE id = $1 FOR UPDATE',
      [line.request_id],
    )).rows[0];
    if (request.request_type !== 'PURCHASE_REQUISITION' || request.status !== 'Approved') {
      throw httpError(409, 'The unit of this requisition can no longer be swapped.');
    }
    const to = (await client.query(
      `SELECT id, item_code, category, quantity, condition FROM item_catalog WHERE id = $1 FOR UPDATE`,
      [toItemId],
    )).rows[0];
    if (!to) throw httpError(404, 'The chosen unit was not found.');
    if (!purchaseCategoryMatches(line.category, to.category)) throw httpError(409, 'The chosen unit is in a different category.');
    if (['Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired'].includes(to.condition)) {
      throw httpError(409, 'A unit that is not serviceable cannot be issued.');
    }
    if (await getAvailableQuantity(client, to) < 1) {
      throw httpError(409, `${to.item_code} is already reserved for another request and ready to issue to someone else.`);
    }

    const from = (await client.query(
      `SELECT id, quantity, fulfilled_quantity FROM purchase_requisition_line_allocations
        WHERE line_id = $1 AND item_id = $2 AND status = 'Reserved' FOR UPDATE`,
      [lineId, fromItemId],
    )).rows[0];
    if (!from || Number(from.quantity) - Number(from.fulfilled_quantity) < 1) {
      throw httpError(409, 'The unit to replace is no longer reserved. Refresh the list.');
    }
    // quantity must stay above zero (table CHECK), so the last unit is released by status instead.
    const unitsLeft = Number(from.quantity) - Number(from.fulfilled_quantity);
    await client.query(
      `UPDATE purchase_requisition_line_allocations
          SET quantity = CASE WHEN $2::INT > 1 THEN quantity - 1 ELSE quantity END,
              status = CASE WHEN $2::INT > 1 THEN 'Reserved' ELSE 'Released' END,
              updated_at = NOW()
        WHERE id = $1`,
      [from.id, unitsLeft],
    );
    await client.query(
      `INSERT INTO purchase_requisition_line_allocations (line_id, item_id, quantity)
       VALUES ($1, $2, 1)
       ON CONFLICT (line_id, item_id) DO UPDATE
         SET quantity = CASE WHEN purchase_requisition_line_allocations.status = 'Released'
                             THEN purchase_requisition_line_allocations.fulfilled_quantity
                             ELSE purchase_requisition_line_allocations.quantity END + 1,
             status = 'Reserved', updated_at = NOW()`,
      [lineId, toItemId],
    );
    await refreshInventoryStatus(client, fromItemId);
    await refreshInventoryStatus(client, toItemId);
    await client.query(
      `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
       SELECT id, status, status, $2, $3 FROM service_requests WHERE id = $1`,
      [line.request_id, `GSO Staff reserved ${to.item_code} for ${line.item_name} instead of the previous unit.`, changedBy],
    );
    await client.query('COMMIT');
    return { lineId: String(lineId), fromItemId: String(fromItemId), toItemId: String(toItemId) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Links bought units that are already in Item Master Data to the requisition items waiting for them, in one step.
// Everything is checked again under row locks, so two staff members cannot link the same units twice.
async function recordPurchaseDeliveries({ deliveries, receiptReference, changedBy }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock requests, then lines, then inventory records, always in id order, so two staff members cannot deadlock.
    const lineIds = [...new Set(deliveries.map((delivery) => delivery.lineId))];
    const requestIds = (await client.query(
      'SELECT DISTINCT request_id FROM purchase_requisition_lines WHERE id = ANY($1::BIGINT[]) ORDER BY request_id',
      [lineIds],
    )).rows.map((row) => row.request_id);
    const requests = new Map((await client.query(
      `SELECT id, reference_no, status FROM service_requests WHERE id = ANY($1::BIGINT[]) ORDER BY id FOR UPDATE`,
      [requestIds],
    )).rows.map((row) => [String(row.id), row]));
    const lines = new Map((await client.query(
      'SELECT * FROM purchase_requisition_lines WHERE id = ANY($1::BIGINT[]) ORDER BY id FOR UPDATE',
      [lineIds],
    )).rows.map((row) => [String(row.id), row]));
    if (lines.size !== lineIds.length) throw httpError(404, 'One of the requested items was not found. Refresh the list.');

    const byLine = new Map();
    for (const delivery of deliveries) byLine.set(delivery.lineId, [...(byLine.get(delivery.lineId) || []), delivery]);
    for (const [lineId, rows] of byLine) {
      const line = lines.get(lineId);
      const request = requests.get(String(line.request_id));
      if (Number(line.finance_quantity) === 0) {
        throw httpError(409, `The delivery of ${line.item_name} is already linked to ${request.reference_no}. Another staff member may have recorded it. Refresh the list.`);
      }
      if (request.status !== 'Sent to Finance') {
        throw httpError(409, `${request.reference_no} has not been handed off to Finance yet, so the delivery cannot be linked.`);
      }
      if (line.route_status === 'HANDOVER_PENDING') {
        throw httpError(409, 'Finish the pending handover of this item before you record a new delivery.');
      }
      if (sumOf(rows, (row) => row.quantity) > Number(line.finance_quantity)) {
        throw httpError(409, `${line.item_name} in ${request.reference_no}: only ${line.finance_quantity} left to receive. Check the quantity.`);
      }
    }

    const itemIds = [...new Set(deliveries.map((delivery) => delivery.itemId))];
    const items = new Map((await client.query(
      `SELECT id, item_code, item_name, description, category, quantity, condition, tracking_mode, unit_of_measure
         FROM item_catalog WHERE id = ANY($1::BIGINT[]) ORDER BY id FOR UPDATE`,
      [itemIds],
    )).rows.map((row) => [String(row.id), row]));
    if (items.size !== itemIds.length) throw httpError(404, 'Inventory record not found. Refresh the list.');

    const planned = deliveries.map((delivery) => {
      const line = lines.get(delivery.lineId);
      const item = items.get(delivery.itemId);
      const inventoryName = String(item.item_name || item.description || '').trim();
      const match = deliveryNameMatch(line.item_name, line.category, item.category, inventoryName);
      if (!match) throw httpError(409, 'The item name and category of the inventory record must match the requested item.');
      if (match === 'SIMILAR' && !delivery.confirmSimilarName) {
        throw httpError(409, `The names "${line.item_name}" and "${inventoryName}" are different. Confirm first that they are the same item.`);
      }
      if (['Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired'].includes(item.condition)) {
        throw httpError(409, 'You cannot link stock that is not serviceable.');
      }
      return { line, item, inventoryName, match, quantity: delivery.quantity };
    });
    for (const item of items.values()) {
      const needed = sumOf(planned.filter((plan) => plan.item === item), (plan) => plan.quantity);
      const available = await getAvailableQuantity(client, item);
      if (available < needed) {
        throw httpError(409, `Not enough available ${item.item_name || item.description} (${item.item_code}): ${available} ${item.unit_of_measure} left, but ${needed} to link. Add the delivery in Item Master Data first.`);
      }
    }

    for (const plan of planned) {
      await client.query(
        `INSERT INTO purchase_requisition_line_allocations (line_id, item_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (line_id, item_id) DO UPDATE
           SET quantity = CASE WHEN purchase_requisition_line_allocations.status = 'Released'
                               THEN purchase_requisition_line_allocations.fulfilled_quantity
                               ELSE purchase_requisition_line_allocations.quantity END + EXCLUDED.quantity,
               status = 'Reserved', updated_at = NOW()`,
        [plan.line.id, plan.item.id, plan.quantity],
      );
      await client.query(
        `INSERT INTO purchase_requisition_line_receipts (line_id, item_id, quantity, receipt_reference, received_by_user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [plan.line.id, plan.item.id, plan.quantity, receiptReference || '', changedBy],
      );
    }
    for (const [lineId, rows] of byLine) {
      const line = lines.get(lineId);
      const received = sumOf(rows, (row) => row.quantity);
      const remaining = Number(line.finance_quantity) - received;
      await client.query(
        `UPDATE purchase_requisition_lines
            SET reserved_quantity = reserved_quantity + $2, finance_quantity = $3, route_status = $4, updated_at = NOW()
          WHERE id = $1`,
        [lineId, received, remaining, remaining > 0 ? 'WAITING_FOR_PURCHASE' : 'READY_FOR_STAFF'],
      );
    }
    for (const item of items.values()) await refreshInventoryStatus(client, item.id);

    const approvedRequestIds = [];
    for (const request of requests.values()) {
      const mine = planned.filter((plan) => String(plan.line.request_id) === String(request.id));
      const similar = mine.filter((plan) => plan.match === 'SIMILAR')
        .map((plan) => `"${plan.inventoryName}" counted as "${plan.line.item_name}"`);
      const note = `GSO Staff recorded the purchased delivery: ${mine.map((plan) => `${plan.quantity} ${plan.item.unit_of_measure} ${plan.line.item_name} (${plan.item.item_code})`).join('; ')}.${receiptReference ? ` Receipt/invoice: ${receiptReference}.` : ''}${similar.length ? ` Name confirmed by staff: ${similar.join('; ')}.` : ''}`;
      await client.query(
        `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
         VALUES ($1, $2, $2, $3, $4)`,
        [request.id, request.status, note.slice(0, 2000), changedBy],
      );
      const open = await client.query(
        `SELECT COUNT(*)::INTEGER AS count
           FROM purchase_requisition_lines
          WHERE request_id = $1
            AND (finance_quantity > 0 OR reserved_quantity < requested_quantity)`,
        [request.id],
      );
      if (Number(open.rows[0].count) === 0) {
        await client.query(`UPDATE service_requests SET status = 'Approved', updated_at = NOW() WHERE id = $1`, [request.id]);
        await client.query(
          `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
           VALUES ($1, 'Sent to Finance', 'Approved', 'Every purchased item has been received and reserved; the items are ready for GSO Staff to issue.', $2)`,
          [request.id, changedBy],
        );
        approvedRequestIds.push(String(request.id));
      } else {
        await client.query('UPDATE service_requests SET updated_at = NOW() WHERE id = $1', [request.id]);
      }
    }
    const updated = [];
    for (const request of requests.values()) updated.push(await getById(client, request.id));
    await client.query('COMMIT');
    return { requests: updated, approvedRequestIds };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Takes a linked delivery back until its units are issued: the stock is released and the item waits for purchase again.
async function undoPurchaseDelivery({ id, receiptId, changedBy }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const request = (await client.query(
      'SELECT id, reference_no, request_type, status FROM service_requests WHERE id = $1 FOR UPDATE',
      [id],
    )).rows[0];
    if (!request || request.request_type !== 'PURCHASE_REQUISITION') throw httpError(404, 'Purchase requisition not found.');
    const receipt = (await client.query(
      `SELECT receipt.* FROM purchase_requisition_line_receipts AS receipt
         JOIN purchase_requisition_lines AS line ON line.id = receipt.line_id
        WHERE receipt.id = $1 AND line.request_id = $2
        FOR UPDATE OF receipt`,
      [receiptId, id],
    )).rows[0];
    if (!receipt) throw httpError(404, 'Delivery record not found.');
    if (receipt.voided_at) throw httpError(409, 'This delivery was already undone. Refresh the page.');
    if (!['Sent to Finance', 'Approved'].includes(request.status)) {
      throw httpError(409, 'The delivery of this requisition can no longer be undone.');
    }
    const line = (await client.query('SELECT * FROM purchase_requisition_lines WHERE id = $1 FOR UPDATE', [receipt.line_id])).rows[0];
    if (line.route_status === 'HANDOVER_PENDING') {
      throw httpError(409, 'Finish the pending handover of this item before you undo the delivery.');
    }
    const item = (await client.query('SELECT id, item_code, unit_of_measure FROM item_catalog WHERE id = $1 FOR UPDATE', [receipt.item_id])).rows[0];
    const allocation = (await client.query(
      `SELECT quantity, fulfilled_quantity FROM purchase_requisition_line_allocations
        WHERE line_id = $1 AND item_id = $2 AND status = 'Reserved' FOR UPDATE`,
      [line.id, receipt.item_id],
    )).rows[0];
    const quantity = Number(receipt.quantity);
    if (!allocation || Number(allocation.quantity) - Number(allocation.fulfilled_quantity) < quantity) {
      throw httpError(409, 'Some units from this delivery were already issued, so it cannot be undone.');
    }

    const remainingAllocation = Number(allocation.quantity) - quantity;
    if (remainingAllocation > 0) {
      await client.query(
        `UPDATE purchase_requisition_line_allocations
            SET quantity = $3, status = CASE WHEN $3 = fulfilled_quantity THEN 'Fulfilled' ELSE 'Reserved' END, updated_at = NOW()
          WHERE line_id = $1 AND item_id = $2`,
        [line.id, receipt.item_id, remainingAllocation],
      );
    } else {
      await client.query(
        `UPDATE purchase_requisition_line_allocations SET status = 'Released', updated_at = NOW() WHERE line_id = $1 AND item_id = $2`,
        [line.id, receipt.item_id],
      );
    }
    const reservedAfter = Number(line.reserved_quantity) - quantity;
    const routeStatus = 'WAITING_FOR_PURCHASE';
    await client.query(
      `UPDATE purchase_requisition_lines
          SET reserved_quantity = $2, finance_quantity = finance_quantity + $3, route_status = $4, updated_at = NOW()
        WHERE id = $1`,
      [line.id, reservedAfter, quantity, routeStatus],
    );
    await client.query(
      'UPDATE purchase_requisition_line_receipts SET voided_at = NOW(), voided_by_user_id = $2 WHERE id = $1',
      [receipt.id, changedBy],
    );
    await refreshInventoryStatus(client, item.id);

    await client.query(
      `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
       VALUES ($1, $2, $2, $3, $4)`,
      [id, request.status, `GSO Staff undid the delivery of ${quantity} ${item.unit_of_measure} ${line.item_name} (${item.item_code}). The item is waiting for purchase again.`, changedBy],
    );
    if (request.status === 'Approved') {
      await client.query(`UPDATE service_requests SET status = 'Sent to Finance', updated_at = NOW() WHERE id = $1`, [id]);
      await client.query(
        `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
         VALUES ($1, 'Approved', 'Sent to Finance', 'A delivery was undone, so the requisition waits for the purchase again.', $2)`,
        [id, changedBy],
      );
    } else {
      await client.query('UPDATE service_requests SET updated_at = NOW() WHERE id = $1', [id]);
    }
    const updated = await getById(client, id);
    await client.query('COMMIT');
    return { request: updated, reopened: request.status === 'Approved' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// The GSO Head approves or declines the complete requisition as one package.
async function reviewPurchaseRequisition({ id, decision, note, changedBy }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = (await client.query(
      'SELECT id, request_type, status FROM service_requests WHERE id = $1 FOR UPDATE',
      [id],
    )).rows[0];
    if (!current || current.request_type !== 'PURCHASE_REQUISITION') throw httpError(404, 'Purchase requisition not found.');
    const lines = (await client.query(
      `SELECT * FROM purchase_requisition_lines
        WHERE request_id = $1
        ORDER BY line_number
        FOR UPDATE`,
      [id],
    )).rows;
    if (current.status !== 'Under Review' || lines.length === 0
      || !lines.some((line) => line.route_status === 'WAITING_GSO_HEAD')) {
      throw httpError(409, 'No full request is waiting for your approval. Refresh the list.');
    }

    if (!['APPROVE', 'DECLINE'].includes(decision)) {
      throw httpError(400, 'Choose whether to approve or decline the whole request.');
    }
    let historyNote;
    if (decision === 'APPROVE') {
      const shortageNames = [];
      const heldNames = [];
      for (const line of lines) {
        // Only the items waiting for the GSO Head are decided here. Items issued now or rejected by GSO Staff keep their status.
        if (line.route_status !== 'WAITING_GSO_HEAD') continue;
        // A "not listed" item the GSO Head approved is saved as an item name, so the requester can pick it next time.
        if (!line.item_name_id) await saveApprovedItemName(client, line, changedBy);
        const requested = Number(line.requested_quantity);
        const reserved = Number(line.reserved_quantity);
        const shortage = Math.max(Number(line.finance_quantity), requested - reserved);
        const routeStatus = shortage > 0 ? 'WAITING_FINANCE' : 'READY_FOR_STAFF';
        await client.query(
          `UPDATE purchase_requisition_lines
              SET route_status = $2, finance_quantity = $3, review_note = '', updated_at = NOW()
            WHERE id = $1`,
          [line.id, routeStatus, shortage],
        );
        if (shortage > 0) shortageNames.push(`${line.item_name} (${shortage} to buy)`);
        else heldNames.push(line.item_name);
      }
      historyNote = `GSO Head approved the items waiting for approval. ${heldNames.length ? `Reserved in-stock items: ${heldNames.join(', ')}. ` : ''}${shortageNames.length ? `Shortage items for Finance: ${shortageNames.join('; ')}. No item can be issued until every requested item is available.` : 'All requested items are reserved and ready for GSO Staff issuance.'}${note ? ` Note: ${note}` : ''}`;
    } else {
      for (const line of lines) {
        if (line.route_status !== 'WAITING_GSO_HEAD') continue;
        await releasePurchaseLineStock(client, line.id);
        await client.query(
          `UPDATE purchase_requisition_lines
              SET route_status = 'REJECTED', reserved_quantity = 0, finance_quantity = 0,
                  review_note = $2, updated_at = NOW()
            WHERE id = $1`,
          [line.id, note],
        );
      }
      historyNote = `GSO Head declined the items waiting for approval: ${note}`;
    }

    const routeStatuses = (await client.query(
      'SELECT route_status FROM purchase_requisition_lines WHERE request_id = $1',
      [id],
    )).rows.map((row) => row.route_status);
    const status = nextRequisitionStatus(routeStatuses, current.status);
    await client.query(
      `UPDATE service_requests
          SET status = $2,
              updated_at = NOW(),
              completed_at = CASE WHEN $2 IN ('Rejected', 'Completed') THEN NOW() ELSE NULL END,
              gso_head_endorsed_by_user_id = CASE WHEN $2 = 'GSO Endorsed' THEN $3 ELSE gso_head_endorsed_by_user_id END,
              gso_head_endorsed_at = CASE WHEN $2 = 'GSO Endorsed' THEN NOW() ELSE gso_head_endorsed_at END
        WHERE id = $1`,
      [id, status, changedBy],
    );
    await client.query(
      `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, current.status, status, historyNote.slice(0, 2000), changedBy],
    );
    const request = await getById(client, id);
    await client.query('COMMIT');
    return request;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// The approved PDF is handed to Finance in person. We keep the established
// "Sent to Finance" status so the delivery and issuance workflow continues
// unchanged, while the history makes the physical handoff explicit.
async function completePhysicalFinanceHandoff({ id, changedBy }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT id, request_type, status
         FROM service_requests
        WHERE id = $1
        FOR UPDATE`,
      [id],
    );
    const current = currentResult.rows[0];
    if (!current || current.request_type !== 'PURCHASE_REQUISITION') {
      throw Object.assign(new Error('Purchase requisition not found.'), { status: 404 });
    }
    if (!['GSO Endorsed', 'Finance Handoff Pending', 'Finance Handoff Failed'].includes(current.status)) {
      throw Object.assign(new Error('The requisition must first be approved by the GSO Head before it is handed off to Finance.'), { status: 409 });
    }
    const shortage = await client.query(
      `SELECT COUNT(*)::INTEGER AS count
         FROM purchase_requisition_lines
        WHERE request_id = $1 AND finance_quantity > 0`,
      [id],
    );
    if (!shortage.rows[0]?.count) {
      throw Object.assign(new Error('There is no shortage to hand off to Finance.'), { status: 409 });
    }

    await client.query(
      `UPDATE service_requests
          SET status = 'Sent to Finance',
              finance_sent_at = NOW(),
              finance_message_id = NULL,
              updated_at = NOW()
        WHERE id = $1`,
      [id],
    );
    await client.query(
      `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
       VALUES ($1, $2, 'Sent to Finance', $3, $4)`,
      [id, current.status, 'GSO Staff handed the signed printed requisition to Finance.', changedBy],
    );
    await client.query(
      `UPDATE purchase_requisition_lines
          SET route_status = 'WAITING_FOR_PURCHASE', updated_at = NOW()
        WHERE request_id = $1 AND finance_quantity > 0 AND route_status = 'WAITING_FINANCE'`,
      [id],
    );
    const request = await getById(client, id);
    await client.query('COMMIT');
    return request;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function requestTitle(requestType, formData) {
  if (requestType === 'BORROWING') return `Asset borrowing: ${formData.items.length} item${formData.items.length === 1 ? '' : 's'}`;
  if (requestType === 'FACILITY_USE') return `Facility use: ${formData.activity}`;
  if (requestType === 'JOB_REQUEST') return `Job request: ${formData.departmentOrganization}`;
  if (requestType === 'PURCHASE_REQUISITION') {
    const firstItem = formData.items?.[0]?.itemName?.trim() || formData.items?.[0]?.description?.trim();
    const summary = firstItem ? firstItem.slice(0, 90) : `${formData.items?.length || 0} requested items`;
    return `Item requisition: ${summary}`;
  }
  if (requestType === 'ISSUANCE_REQUEST') return `Item issuance: ${formData.items.length} item${formData.items.length === 1 ? '' : 's'}`;
  return `${formData.incidentType === 'LOST' ? 'Lost property' : 'Property damage'} report: ${formData.keyArea}`;
}

async function availableForBorrowing(queryable, item) {
  const result = await queryable.query(
    `SELECT item.quantity::INTEGER AS total_quantity,
            COALESCE((
              SELECT SUM(issue.quantity - issue.returned_quantity)
                FROM employee_issuances AS issue
               WHERE issue.item_id = item.id AND issue.status IN ('Pending', 'Issued')
            ), 0)
            + COALESCE((
              SELECT SUM(asset.quantity)
                FROM service_request_assets AS asset
                JOIN service_requests AS request ON request.id = asset.request_id
               WHERE asset.item_id = item.id
                 AND request.status IN ('Approved', 'Ready for Pickup', 'Issued', 'Return Requested', 'For Repair')
            ), 0) AS active_quantity
       FROM item_catalog AS item
      WHERE item.id = $1`,
    [item.id],
  );
  return Math.max(0, Number(result.rows[0]?.total_quantity || 0) - Number(result.rows[0]?.active_quantity || 0));
}

const purchaseCategoryAliases = {
  OFFICE_SUPPLIES: ['office_supplies'],
  OFFICE_EQUIPMENT: ['office_equipment'],
  MACHINERY_PARTS: ['machinery_parts', 'machineries_parts'],
  COMPUTER_PERIPHERALS: ['computer_parts_peripherals', 'computer_peripherals', 'peripherals_computer_parts'],
  TOOLS_EQUIPMENT: ['tools_equipment', 'tools_and_equipment'],
  ELECTRICAL_SUPPLIES: ['electrical_supplies'],
  OTHER_CONSUMABLES: ['other_consumables'],
  OTHER: ['other', 'others'],
  PUBLICATIONS: ['publications'],
};

function normalizePurchaseCategory(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function purchaseCategoryMatches(requestCategory, inventoryCategory) {
  const normalizedInventoryCategory = normalizePurchaseCategory(inventoryCategory);
  return (purchaseCategoryAliases[requestCategory] || [normalizePurchaseCategory(requestCategory)])
    .includes(normalizedInventoryCategory);
}

// Saves an approved proposed name under its matching category (the Manage Categories & Item Names list).
// shortcut: a category with no match is skipped, not created; upgrade if requesters pick categories GSO has not set up.
async function saveApprovedItemName(client, line, changedBy) {
  const name = String(line.item_name || '').trim();
  if (!name) return;
  // A line picked from existing stock also has no item name id; its name is already in Item Master Data, so skip it.
  const inStock = await client.query(
    `SELECT 1 FROM item_catalog WHERE lower(COALESCE(NULLIF(item_name, ''), description)) = lower($1) LIMIT 1`,
    [name],
  );
  if (inStock.rowCount) return;
  const categories = (await client.query('SELECT id, name FROM item_categories ORDER BY id')).rows;
  const category = categories.find((row) => purchaseCategoryMatches(line.category, row.name));
  if (!category) return;
  await client.query(
    `INSERT INTO item_category_item_names (category_id, name, created_by_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (category_id, lower(name)) DO NOTHING`,
    [category.id, name, changedBy],
  );
}

// An exactly matching name links even when GSO filed the stock under another category (for example a fan
// under Electrical Supplies instead of Office Equipment). Similar names still need the same category.
function deliveryNameMatch(requestedName, requestCategory, inventoryCategory, inventoryName) {
  const match = nameMatch(requestedName, inventoryName);
  if (match === 'EXACT') return match;
  return match && purchaseCategoryMatches(requestCategory, inventoryCategory) ? match : null;
}

async function releasePurchaseLineStock(client, lineId) {
  const released = await client.query(
    `UPDATE purchase_requisition_line_allocations
        SET status = 'Released', updated_at = NOW()
      WHERE line_id = $1 AND status = 'Reserved'
      RETURNING item_id`,
    [lineId],
  );
  // A released unit goes back to Available unless another reservation still holds it.
  for (const row of released.rows) await refreshInventoryStatus(client, row.item_id);
}

async function createRequest({ requestType, formData, userId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let items = [];
    if (requestType === 'BORROWING') {
      const itemIds = formData.items.map((item) => item.itemId).sort((a, b) => Number(a) - Number(b));
      const inventory = await client.query(
        `SELECT id, item_code, COALESCE(NULLIF(item_name, ''), description) AS name,
                unit_of_measure, condition, inventory_status, quantity, tracking_mode, issue_behavior
           FROM item_catalog
          WHERE id = ANY($1::BIGINT[])
          ORDER BY id
          FOR UPDATE`,
        [itemIds],
      );
      if (inventory.rowCount !== itemIds.length) throw Object.assign(new Error('An item is no longer in inventory.'), { status: 400 });
      const inventoryById = new Map(inventory.rows.map((item) => [String(item.id), item]));
      items = formData.items.map((requested) => {
        const item = inventoryById.get(requested.itemId);
        if (!item || item.tracking_mode !== 'quantity' || item.issue_behavior !== 'returnable'
          || ['Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired'].includes(item.condition)) {
          throw Object.assign(new Error('One of the chosen items is not available to borrow.'), { status: 409 });
        }
        return { ...requested, inventoryItem: item };
      });
      for (const requested of items) {
        const available = await availableForBorrowing(client, requested.inventoryItem);
        if (requested.quantity > available) {
          throw Object.assign(new Error(`Not enough stock of ${requested.inventoryItem.name}. Available: ${available}.`), { status: 409 });
        }
      }
    }

    if (requestType === 'FACILITY_USE' && formData.equipment.length) {
      // Each equipment row becomes an Item Master record. Its name, code, description and unit come from the record, not the form.
      formData = { ...formData, equipment: await facilityEquipmentRows(client, formData.equipment) };
    }
    if (requestType === 'LOSS_DAMAGE_REPORT') {
      // Each row must be an item still out with this requester. The server copies the name and code from the issuance.
      formData = { ...formData, items: await reportedIssuedRows(client, userId, formData.items) };
    }
    const sequence = await client.query("SELECT nextval('service_request_reference_seq')::TEXT AS value");
    const referenceNo = `REQ-${new Date().getFullYear()}-${String(sequence.rows[0].value).padStart(5, '0')}`;
    const title = requestTitle(requestType, formData);
    const created = await client.query(
      `INSERT INTO service_requests (reference_no, request_type, title, form_data, requested_by_user_id)
       VALUES ($1, $2, $3, $4::JSONB, $5)
       RETURNING id`,
      [referenceNo, requestType, title, JSON.stringify(withoutPhotos(formData)), userId],
    );
    const requestId = created.rows[0].id;

    if (requestType === 'PURCHASE_REQUISITION') {
      // Every item waits for GSO Staff, who check stock and route it (see staffReviewPurchaseRequisition).
      for (const [index, requested] of formData.items.entries()) {
        await client.query(
          `INSERT INTO purchase_requisition_lines (
             request_id, line_number, item_name_id, category, item_name, specifications,
             requested_quantity, approval_policy, staff_issue_max_quantity, route_status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'WAITING_STAFF_REVIEW')`,
          [requestId, index + 1, requested.itemNameId || null, requested.category, requested.itemName,
            requested.description || '', Number(requested.quantity),
            requested.approvalPolicy === 'STAFF_ISSUE' ? 'STAFF_ISSUE' : 'GSO_HEAD',
            requested.staffIssueMaxQuantity == null ? null : Number(requested.staffIssueMaxQuantity)],
        );
      }
    }

    for (const requested of items) {
      await client.query(
        `INSERT INTO service_request_assets (request_id, item_id, quantity, unit_of_measure)
         VALUES ($1, $2, $3, $4)`,
        [requestId, requested.itemId, requested.quantity, requested.inventoryItem.unit_of_measure],
      );
    }
    await client.query(
      `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
       VALUES ($1, NULL, 'Submitted', $2, $3)`,
      [requestId, requestType === 'PURCHASE_REQUISITION'
        ? 'Purchase requisition submitted by EmployeeHead for GSO Staff stock check.'
        : 'Request submitted.', userId],
    );
    // The work order is created in this same transaction, so a job can never exist without its route.
    if (requestType === 'JOB_REQUEST') await serviceWorkOrdersRepository.createForJobRequest(client, { requestId, formData, userId });
    const request = await getById(client, requestId);
    await client.query('COMMIT');
    return request;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Job photos go to their own table (service_work_order_photos), so they are kept out of the request's form data.
function withoutPhotos({ photos, ...formData }) {
  return formData;
}

// A Loss / Damage Report can name only items issued to the requester and still out with them. The name and code come
// from the issuance record, so the requester cannot type a different item. Same rules as My Issued Items.
async function reportedIssuedRows(client, userId, rows) {
  const picked = new Set();
  const reported = [];
  for (const row of rows) {
    const found = await client.query(
      `SELECT issue.id, issue.quantity, COALESCE(issue.returned_quantity, 0) AS returned_quantity, issue.status,
              issue.unit_of_measure, inventory.item_code, inventory.description AS name, inventory.issue_behavior, inventory.tracking_mode
         FROM requester_identity_profiles AS profile
         JOIN employees AS employee ON lower(trim(employee.employee_code)) = lower(trim(profile.employee_code))
         JOIN employee_issuance_batches AS batch ON batch.employee_id = employee.id
         JOIN employee_issuances AS issue ON issue.batch_id = batch.id
         JOIN item_catalog AS inventory ON inventory.id = issue.item_id
        WHERE profile.user_id = $1 AND profile.verification_status = 'Verified'
          AND batch.requester_user_id = $1 AND issue.id = $2`,
      [userId, row.issuanceId],
    );
    const issue = found.rows[0];
    if (!issue || issue.status !== 'Issued') throw httpError(409, 'One of the items is not issued to you. Refresh the list and pick again.');
    if (issue.issue_behavior === 'consumable') throw httpError(409, `${issue.name} is used up, so it cannot be reported as lost or damaged.`);
    let assetCode = issue.item_code;
    let candidateUnits = [];
    if (row.identityUnknown) {
      if (row.tagCode || issue.tracking_mode !== 'individual') {
        throw httpError(400, 'Only a barcode-tracked unit without a selected asset tag can be marked as unidentified.');
      }
      const tags = await client.query(
        `SELECT tag_code FROM asset_unit_tags
          WHERE issuance_id = $1 AND custody_status = 'Issued' AND lifecycle_status = 'Active'
          ORDER BY tag_code`,
        [issue.id],
      );
      if (tags.rowCount < Number(row.quantity)) {
        throw httpError(409, `There are not enough unidentified active units of ${issue.name} on this issuance. Refresh the list and try again.`);
      }
      candidateUnits = tags.rows.map((tag) => ({ tagCode: tag.tag_code }));
    }
    if (row.tagCode) {
      if (Number(row.quantity) !== 1) throw httpError(400, 'Report each unit with its barcode one at a time.');
      const unit = await client.query(
        `SELECT tag_code FROM asset_unit_tags
          WHERE issuance_id = $1 AND tag_code = $2 AND custody_status <> 'Available'`,
        [issue.id, row.tagCode],
      );
      if (unit.rowCount !== 1) throw httpError(409, 'That unit is not issued to you. Refresh the list and pick again.');
      assetCode = unit.rows[0].tag_code;
    } else {
      const outstanding = Number(issue.quantity) - Number(issue.returned_quantity);
      if (Number(row.quantity) > outstanding) throw httpError(409, `You only have ${outstanding} ${issue.unit_of_measure} of ${issue.name} with you.`);
      if (!row.identityUnknown && issue.tracking_mode !== 'quantity') {
        throw httpError(400, `Choose an asset tag for each ${issue.name} unit, or mark the lost unit as unidentified.`);
      }
    }
    const key = row.tagCode ? `unit:${assetCode}` : `issuance:${issue.id}`;
    if (picked.has(key)) throw httpError(400, 'Each item can only be reported once.');
    picked.add(key);
    reported.push({
      quantity: Number(row.quantity),
      description: issue.name,
      assetCode,
      identityUnknown: row.identityUnknown === true,
      ...(candidateUnits.length ? { candidateUnits } : {}),
      remarks: row.remarks || '',
      issuanceId: String(issue.id),
      unitOfMeasure: issue.unit_of_measure,
    });
  }
  return reported;
}

const FACILITY_UNAVAILABLE_CONDITIONS = ['Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired'];

// Turns the form's rows into Item Master rows and checks the stock when the request is sent.
// An individually tracked model has one record per unit, so asking for 3 takes 3 serviceable records of that model
// (same name, description, and category), starting with the record the requester picked.
async function facilityEquipmentRows(client, requested) {
  const chosen = await client.query(
    `SELECT id, item_code, category_id, COALESCE(NULLIF(item_name, ''), description) AS name,
            COALESCE(description, '') AS description, COALESCE(unit_of_measure, 'pcs') AS unit,
            condition, issue_behavior, tracking_mode
       FROM item_catalog
      WHERE id = ANY($1::BIGINT[])`,
    [requested.map((row) => row.itemId)],
  );
  const recordById = new Map(chosen.rows.map((record) => [String(record.id), record]));
  const taken = new Map();
  const rows = [];
  for (const row of requested) {
    const record = recordById.get(String(row.itemId));
    if (!record) throw httpError(400, 'One of the items is no longer in the Item Master. Refresh the page and pick it again.');
    if (record.issue_behavior === 'consumable' || FACILITY_UNAVAILABLE_CONDITIONS.includes(record.condition)) {
      throw httpError(409, `${record.name} cannot be borrowed right now.`);
    }
    const units = record.tracking_mode === 'individual'
      ? (await client.query(
        `SELECT id, item_code
           FROM item_catalog
          WHERE tracking_mode = 'individual' AND issue_behavior <> 'consumable'
            AND COALESCE(NULLIF(item_name, ''), description) = $1 AND COALESCE(description, '') = $2
            AND category_id IS NOT DISTINCT FROM $3 AND COALESCE(condition, '') <> ALL($4::TEXT[])
          ORDER BY (id = $5) DESC, id`,
        [record.name, record.description, record.category_id, FACILITY_UNAVAILABLE_CONDITIONS, record.id],
      )).rows
      : [{ id: record.id, item_code: record.item_code }];
    let remaining = Number(row.quantity);
    let available = 0;
    for (const unit of units) {
      const free = Math.max((await availableForBorrowing(client, unit)) - (taken.get(String(unit.id)) || 0), 0);
      available += free;
      const take = Math.min(free, remaining);
      if (take > 0) {
        taken.set(String(unit.id), (taken.get(String(unit.id)) || 0) + take);
        rows.push({ name: record.name, description: record.description, quantity: take, unit: record.unit, itemCode: unit.item_code, itemId: String(unit.id) });
        remaining -= take;
      }
      if (remaining === 0) break;
    }
    if (remaining > 0) throw httpError(409, `Not enough stock of ${record.name}. Available: ${available}.`);
  }
  return rows;
}

// Equipment of a facility request is reserved when GSO approves it, so other requests cannot take the same stock.
// Completing the request gives it back, because stock only counts requests that are still Approved or later.
async function reserveFacilityEquipment(client, requestId, facility) {
  const rows = (facility.equipment || []).filter((row) => row.itemId);
  if (!rows.length) return;
  const records = await client.query(
    `SELECT id, COALESCE(NULLIF(item_name, ''), description) AS name, COALESCE(unit_of_measure, 'pcs') AS unit, condition, issue_behavior
       FROM item_catalog
      WHERE id = ANY($1::BIGINT[])
      ORDER BY id
      FOR UPDATE`,
    [rows.map((row) => row.itemId)],
  );
  const recordById = new Map(records.rows.map((record) => [String(record.id), record]));
  for (const row of rows) {
    const record = recordById.get(String(row.itemId));
    if (!record) throw httpError(400, 'One of the items is no longer in the Item Master.');
    if (record.issue_behavior === 'consumable' || FACILITY_UNAVAILABLE_CONDITIONS.includes(record.condition)) {
      throw httpError(409, `${record.name} cannot be borrowed right now.`);
    }
    const available = await availableForBorrowing(client, record);
    if (Number(row.quantity) > available) throw httpError(409, `Not enough stock of ${record.name}. Available: ${available}.`);
    await client.query(
      'INSERT INTO service_request_assets (request_id, item_id, quantity, unit_of_measure) VALUES ($1, $2, $3, $4)',
      [requestId, record.id, Number(row.quantity), record.unit],
    );
  }
}

async function setStatus({ id, expectedStatus, status, note, changedBy, dueDate, conditionOut, conditionIn, conditionsIn = null, facilityReturns = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      'SELECT id, reference_no, request_type, status, form_data FROM service_requests WHERE id = $1 FOR UPDATE',
      [id],
    );
    const current = currentResult.rows[0];
    if (!current) throw Object.assign(new Error('Request not found.'), { status: 404 });
    if (current.status !== expectedStatus) throw Object.assign(new Error('The request status changed. Refresh the queue and try again.'), { status: 409 });

    if (current.request_type === 'BORROWING' && status === 'Approved') {
      const requestItems = await client.query(
        `SELECT asset.item_id AS id, asset.quantity, item.item_code, item.item_name, item.description, item.condition, item.quantity AS total_quantity
           FROM service_request_assets AS asset
           JOIN item_catalog AS item ON item.id = asset.item_id
          WHERE asset.request_id = $1
          ORDER BY item.id
          FOR UPDATE OF item`,
        [id],
      );
      for (const requested of requestItems.rows) {
        if (['Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired'].includes(requested.condition)) {
          throw Object.assign(new Error(`Cannot approve ${requested.item_name || requested.description}; it is no longer available.`), { status: 409 });
        }
        const available = await availableForBorrowing(client, requested);
        if (Number(requested.quantity) > available) {
          throw Object.assign(new Error(`Not enough stock of ${requested.item_name || requested.description}. Available: ${available}.`), { status: 409 });
        }
      }
    }

    if (current.request_type === 'FACILITY_USE' && status === 'Approved') {
      const facility = current.form_data;
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [facility.venue.toLowerCase(), facility.date]);
      const conflict = await client.query(
        `SELECT reference_no
           FROM service_requests
          WHERE id <> $1
            AND request_type = 'FACILITY_USE'
            AND status IN ('Approved', 'Issued', 'For Repair', 'Returned')
            AND lower(form_data->>'venue') = lower($2)
            AND form_data->>'date' = $3
            AND form_data->>'startTime' < $5
            AND form_data->>'endTime' > $4
          LIMIT 1`,
        [id, facility.venue, facility.date, facility.startTime, facility.endTime],
      );
      if (conflict.rowCount) {
        throw Object.assign(new Error(`An approved request already exists for this venue and time (${conflict.rows[0].reference_no}).`), { status: 409 });
      }
      await reserveFacilityEquipment(client, id, facility);
    }

    // Approving a borrowing starts it in this same transaction: the item is released, with no pickup step.
    const startsBorrowing = current.request_type === 'BORROWING' && status === 'Approved';
    const finalStatus = startsBorrowing ? 'Issued' : status;
    await client.query(
      `UPDATE service_requests
          SET status = $2,
              updated_at = NOW(),
              completed_at = CASE WHEN $2 IN ('Returned', 'Completed', 'Closed', 'Rejected', 'Cancelled') THEN NOW() ELSE NULL END
        WHERE id = $1`,
      [id, finalStatus],
    );
    // A facility release starts the loan: the event date is the due date the Item Master shows.
    if (current.request_type === 'FACILITY_USE' && finalStatus === 'Issued') {
      await client.query(
        'UPDATE service_request_assets SET issued_at = NOW(), due_date = $2::DATE WHERE request_id = $1',
        [id, current.form_data.date || null],
      );
    }
    if (current.request_type === 'FACILITY_USE' && facilityReturns) {
      await recordFacilityReturn(client, { requestId: id, referenceNo: current.reference_no, lines: facilityReturns, userId: changedBy });
    }
    if (current.request_type === 'BORROWING' && finalStatus === 'Issued') {
      const effectiveDueDate = dueDate || current.form_data.returnDate;
      await client.query(
        `UPDATE service_request_assets
            SET due_date = $2::DATE, issued_at = NOW(), condition_out = $3
          WHERE request_id = $1`,
        [id, effectiveDueDate, conditionOut || 'Good'],
      );
    }
    if (current.request_type === 'BORROWING' && conditionsIn) {
      for (const [assetId, assetCondition] of Object.entries(conditionsIn)) {
        await client.query(
          `UPDATE service_request_assets
              SET returned_at = COALESCE(returned_at, NOW()), condition_in = $3
            WHERE request_id = $1 AND id = $2`,
          [id, assetId, assetCondition],
        );
      }
    } else if (current.request_type === 'BORROWING' && ['Returned', 'For Repair'].includes(status)) {
      await client.query(
        `UPDATE service_request_assets
            SET returned_at = COALESCE(returned_at, NOW()), condition_in = $2
          WHERE request_id = $1`,
        [id, conditionIn || (status === 'For Repair' ? 'Needs Repair' : 'Good')],
      );
    }
    if (['BORROWING', 'FACILITY_USE'].includes(current.request_type)) {
      const linkedItems = await client.query('SELECT DISTINCT item_id FROM service_request_assets WHERE request_id = $1', [id]);
      for (const item of linkedItems.rows) await refreshInventoryStatus(client, item.item_id);
    }
    await client.query(
      `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, current.status, status, note || '', changedBy],
    );
    if (startsBorrowing) {
      await client.query(
        `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
         VALUES ($1, 'Approved', 'Issued', 'Borrowing started on approval.', $2)`,
        [id, changedBy],
      );
    }
    const request = await getById(client, id);
    await client.query('COMMIT');
    return request;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function respondToRequest({ id, userId, message }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, status, request_type, form_data FROM service_requests
        WHERE id = $1 AND requested_by_user_id = $2
        FOR UPDATE`,
      [id, userId],
    );
    const current = result.rows[0];
    if (!current) throw Object.assign(new Error('Request not found.'), { status: 404 });
    const messages = Array.isArray(current.form_data.responseMessages) ? current.form_data.responseMessages : [];
    const nextFormData = { ...current.form_data, responseMessages: [...messages, { message, createdAt: new Date().toISOString() }] };
    const nextStatus = current.status === 'Needs Information' ? 'Submitted' : current.status;
    await client.query(
      `UPDATE service_requests SET form_data = $2::JSONB, status = $3, updated_at = NOW() WHERE id = $1`,
      [id, JSON.stringify(nextFormData), nextStatus],
    );
    if (current.request_type === 'PURCHASE_REQUISITION' && nextStatus === 'Submitted') {
      // The reply goes back to GSO Staff, who check stock again before routing.
      await client.query(
        `UPDATE purchase_requisition_lines
            SET route_status = 'WAITING_STAFF_REVIEW', review_note = '', updated_at = NOW()
          WHERE request_id = $1 AND route_status = 'NEEDS_INFORMATION'`,
        [id],
      );
    }
    await client.query(
      `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, current.status, nextStatus, `Requester response: ${message}`, userId],
    );
    const request = await getById(client, id);
    await client.query('COMMIT');
    return request;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function changeMineStatus({ id, userId, expectedStatus, status, note }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, status, request_type FROM service_requests
        WHERE id = $1 AND requested_by_user_id = $2
        FOR UPDATE`,
      [id, userId],
    );
    const current = result.rows[0];
    if (!current) throw Object.assign(new Error('Request not found.'), { status: 404 });
    if (current.status !== expectedStatus) throw Object.assign(new Error('The request status has changed. Refresh the page first.'), { status: 409 });
    if (status === 'Cancelled' && current.request_type === 'PURCHASE_REQUISITION') {
      const activeResult = await client.query(
        `SELECT EXISTS (
           SELECT 1 FROM purchase_requisition_lines
            WHERE request_id = $1 AND (issued_quantity > 0 OR route_status IN ('HANDOVER_PENDING', 'ISSUED'))
         ) AS has_issued_lines`,
        [id],
      );
      if (activeResult.rows[0]?.has_issued_lines) {
        throw Object.assign(new Error('The request can no longer be cancelled after an item has been released or is in handover.'), { status: 409 });
      }
      const lines = await client.query('SELECT id FROM purchase_requisition_lines WHERE request_id = $1', [id]);
      for (const line of lines.rows) {
        await releasePurchaseLineStock(client, line.id);
        await client.query(
          `UPDATE purchase_requisition_lines SET route_status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
          [line.id],
        );
      }
    }
    await client.query(
      `UPDATE service_requests
          SET status = $2,
              updated_at = NOW(),
              completed_at = CASE WHEN $2 = 'Cancelled' THEN NOW() ELSE completed_at END
        WHERE id = $1`,
      [id, status],
    );
    await client.query(
      `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, current.status, status, note, userId],
    );
    const request = await getById(client, id);
    await client.query('COMMIT');
    return request;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listAssets,
  swapRequisitionUnit,
  listRequisitionStorageCandidates,
  listPurchaseItemNames,
  listPurchaseItemNamesByIds,
  listCatalogItemsByIds,
  getById,
  listMine,
  getMineById,
  listAll,
  listPurchaseRequisitions,
  listStaffPurchaseRequisitions,
  listItemsToBuy,
  attachStaffStockChecks,
  staffReviewPurchaseRequisition,
  listAwaitingDeliveries,
  recordPurchaseDeliveries,
  undoPurchaseDelivery,
  createRequest,
  setStatus,
  reviewPurchaseRequisition,
  completePhysicalFinanceHandoff,
  respondToRequest,
  changeMineStatus,
};
