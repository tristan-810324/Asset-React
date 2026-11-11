const pool = require('../../config/db');
const { getAvailableQuantity, refreshInventoryStatus } = require('../inventory/inventory.stock');
const { staffRouteOptions, nextRequisitionStatus, nameMatch } = require('./requisition-routing');

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
         requester.id AS "requesterId",
         requester.name AS "requesterName",
         requester.email AS "requesterEmail",
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
             'returnedAt', asset.returned_at
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

async function listAssets() {
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
            GREATEST(item.quantity - COALESCE(employee_usage.active_quantity, 0) - COALESCE(borrower_usage.active_quantity, 0), 0)::INTEGER AS "availableQuantity"
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
         SELECT COALESCE(SUM(asset.quantity), 0) AS active_quantity
           FROM service_request_assets AS asset
           JOIN service_requests AS request ON request.id = asset.request_id
          WHERE asset.item_id = item.id
            AND request.status IN ('Approved', 'Ready for Pickup', 'Issued', 'Return Requested', 'For Repair')
       ) AS borrower_usage ON TRUE
      WHERE item.quantity > 0
        AND item.condition NOT IN ('Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired')
      ORDER BY lower(COALESCE(NULLIF(item.item_name, ''), item.description)), item.id`,
  );
  // The requester catalog lists every usable item, out of stock included; only reusable quantity
  // stock can be borrowed (createRequest enforces that), the rest is requested for issuance.
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

// Inventory records with the same item name and category, and how many units each can still give.
// `consumed` carries units already planned for earlier items of the same request in a preview.
async function checkLineStock(queryable, line, { lock = false, consumed = new Map() } = {}) {
  const candidates = await queryable.query(
    `SELECT item.id, item.item_code, COALESCE(NULLIF(item.item_name, ''), item.description) AS name,
            item.category, item.quantity, item.unit_of_measure
       FROM item_catalog AS item
      WHERE lower(trim(COALESCE(NULLIF(item.item_name, ''), item.description))) = lower(trim($1))
        AND item.quantity > 0
        AND item.condition NOT IN ('Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired')
      ORDER BY item.id
      ${lock ? 'FOR UPDATE OF item' : ''}`,
    [line.itemName],
  );
  const requestedQuantity = Number(line.requestedQuantity);
  let remaining = requestedQuantity;
  const matches = [];
  for (const item of candidates.rows) {
    if (!purchaseCategoryMatches(line.category, item.category)) continue;
    const itemId = String(item.id);
    const availableQuantity = Math.max(0, await getAvailableQuantity(queryable, item) - (consumed.get(itemId) || 0));
    const reserveQuantity = Math.min(remaining, availableQuantity);
    remaining -= reserveQuantity;
    if (reserveQuantity) consumed.set(itemId, (consumed.get(itemId) || 0) + reserveQuantity);
    matches.push({ itemId, itemCode: item.item_code, name: item.name, unitOfMeasure: item.unit_of_measure, availableQuantity, reserveQuantity });
  }
  const availableQuantity = matches.reduce((total, match) => total + match.availableQuantity, 0);
  const options = staffRouteOptions({ requestedQuantity, availableQuantity });
  return {
    route: options[0],
    options,
    availableQuantity,
    reservedQuantity: requestedQuantity - remaining,
    matches,
  };
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
  const parts = [
    counts.ISSUE && `${counts.ISSUE} ready for GSO Staff issuance`,
    counts.HEAD_ISSUE && `${counts.HEAD_ISSUE} in stock but sent to the GSO Head for approval`,
    counts.PURCHASE && `${counts.PURCHASE} sent to the GSO Head for purchase approval`,
  ].filter(Boolean);
  return `GSO Staff checked stock: ${parts.join('; ')}.${note ? ` Note: ${note}` : ''}`;
}

async function staffReviewPurchaseRequisition({ id, action, note, expectedRoutes, changedBy }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = (await client.query(
      'SELECT id, request_type, status FROM service_requests WHERE id = $1 FOR UPDATE',
      [id],
    )).rows[0];
    if (!current || current.request_type !== 'PURCHASE_REQUISITION') throw httpError(404, 'Hindi makita ang purchase requisition.');
    const lines = (await client.query(
      `SELECT * FROM purchase_requisition_lines
        WHERE request_id = $1 AND route_status = 'WAITING_STAFF_REVIEW'
        ORDER BY line_number
        FOR UPDATE`,
      [id],
    )).rows;
    if (current.status !== 'Submitted' || lines.length === 0) {
      throw httpError(409, 'Na-review na ang requisition na ito. I-refresh ang listahan.');
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
      const counts = { ISSUE: 0, HEAD_ISSUE: 0, PURCHASE: 0 };
      for (const line of lines) {
        await releasePurchaseLineStock(client, line.id);
        const check = await checkLineStock(client, {
          itemName: line.item_name,
          category: line.category,
          requestedQuantity: line.requested_quantity,
        }, { lock: true });
        // The staff member's choice must still be allowed by current stock.
        const route = expectedRoutes[String(line.id)];
        if (!check.options.includes(route)) {
          throw httpError(409, `Nagbago ang stock ng ${line.item_name}. I-refresh at i-check muli bago mag-route.`);
        }
        for (const match of check.matches.filter((entry) => entry.reserveQuantity > 0)) {
          await client.query(
            `INSERT INTO purchase_requisition_line_allocations (line_id, item_id, quantity)
             VALUES ($1, $2, $3)
             ON CONFLICT (line_id, item_id) DO UPDATE
               SET quantity = EXCLUDED.quantity, fulfilled_quantity = 0, status = 'Reserved', updated_at = NOW()`,
            [line.id, match.itemId, match.reserveQuantity],
          );
        }
        counts[route] += 1;
        await client.query(
          `UPDATE purchase_requisition_lines
              SET route_status = $2, reserved_quantity = $3, finance_quantity = $4, review_note = '', updated_at = NOW()
            WHERE id = $1`,
          [line.id, route === 'ISSUE' ? 'READY_FOR_STAFF' : 'WAITING_GSO_HEAD', check.reservedQuantity,
            Number(line.requested_quantity) - check.reservedQuantity],
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
              staff_review_note = $4, updated_at = NOW()
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
      if (!purchaseCategoryMatches(line.category, item.category)) continue;
      const match = nameMatch(line.itemName, item.name);
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
    if (lines.size !== lineIds.length) throw httpError(404, 'Hindi makita ang isa sa mga requested item. I-refresh ang listahan.');

    const byLine = new Map();
    for (const delivery of deliveries) byLine.set(delivery.lineId, [...(byLine.get(delivery.lineId) || []), delivery]);
    for (const [lineId, rows] of byLine) {
      const line = lines.get(lineId);
      const request = requests.get(String(line.request_id));
      if (Number(line.finance_quantity) === 0) {
        throw httpError(409, `Na-link na ang delivery ng ${line.item_name} sa ${request.reference_no}. Posibleng may ibang staff na nag-record. I-refresh ang listahan.`);
      }
      if (request.status !== 'Sent to Finance') {
        throw httpError(409, `Hindi pa naipadala ng GSO Head sa Finance ang ${request.reference_no}, kaya hindi pa puwedeng i-link ang delivery.`);
      }
      if (line.route_status === 'HANDOVER_PENDING') {
        throw httpError(409, 'Tapusin muna ang pending handover ng item na ito bago i-record ang bagong delivery.');
      }
      if (sumOf(rows, (row) => row.quantity) > Number(line.finance_quantity)) {
        throw httpError(409, `${line.item_name} sa ${request.reference_no}: ${line.finance_quantity} na lang ang kailangang i-receive. I-check ang quantity.`);
      }
    }

    const itemIds = [...new Set(deliveries.map((delivery) => delivery.itemId))];
    const items = new Map((await client.query(
      `SELECT id, item_code, item_name, description, category, quantity, condition, tracking_mode, unit_of_measure
         FROM item_catalog WHERE id = ANY($1::BIGINT[]) ORDER BY id FOR UPDATE`,
      [itemIds],
    )).rows.map((row) => [String(row.id), row]));
    if (items.size !== itemIds.length) throw httpError(404, 'Hindi makita ang inventory record. I-refresh ang listahan.');

    const planned = deliveries.map((delivery) => {
      const line = lines.get(delivery.lineId);
      const item = items.get(delivery.itemId);
      const inventoryName = String(item.item_name || item.description || '').trim();
      const match = purchaseCategoryMatches(line.category, item.category) ? nameMatch(line.item_name, inventoryName) : null;
      if (!match) throw httpError(409, 'Dapat tugma ang item name at category ng inventory record sa requested item.');
      if (match === 'SIMILAR' && !delivery.confirmSimilarName) {
        throw httpError(409, `Magkaiba ang pangalan ng "${line.item_name}" at "${inventoryName}". Kumpirmahin muna na iisang item ang dalawa.`);
      }
      if (['Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired'].includes(item.condition)) {
        throw httpError(409, 'Hindi puwedeng i-link ang stock na hindi serviceable.');
      }
      return { line, item, inventoryName, match, quantity: delivery.quantity };
    });
    for (const item of items.values()) {
      const needed = sumOf(planned.filter((plan) => plan.item === item), (plan) => plan.quantity);
      const available = await getAvailableQuantity(client, item);
      if (available < needed) {
        throw httpError(409, `Hindi sapat ang available na ${item.item_name || item.description} (${item.item_code}): ${available} ${item.unit_of_measure} lang, pero ${needed} ang ili-link. I-add muna sa Item Master Data ang aktuwal na delivery, o i-refresh ang listahan; baka may ibang staff na nag-link nito.`);
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
        [lineId, received, remaining, remaining > 0 ? 'PARTIAL_STOCK' : 'READY_FOR_STAFF'],
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
        'SELECT COUNT(*)::INTEGER AS count FROM purchase_requisition_lines WHERE request_id = $1 AND finance_quantity > 0',
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
    if (!request || request.request_type !== 'PURCHASE_REQUISITION') throw httpError(404, 'Hindi makita ang purchase requisition.');
    const receipt = (await client.query(
      `SELECT receipt.* FROM purchase_requisition_line_receipts AS receipt
         JOIN purchase_requisition_lines AS line ON line.id = receipt.line_id
        WHERE receipt.id = $1 AND line.request_id = $2
        FOR UPDATE OF receipt`,
      [receiptId, id],
    )).rows[0];
    if (!receipt) throw httpError(404, 'Hindi makita ang delivery record.');
    if (receipt.voided_at) throw httpError(409, 'Na-undo na ang delivery na ito. I-refresh ang page.');
    if (!['Sent to Finance', 'Approved'].includes(request.status)) {
      throw httpError(409, 'Hindi na maa-undo ang delivery ng requisition na ito.');
    }
    const line = (await client.query('SELECT * FROM purchase_requisition_lines WHERE id = $1 FOR UPDATE', [receipt.line_id])).rows[0];
    if (line.route_status === 'HANDOVER_PENDING') {
      throw httpError(409, 'Tapusin muna ang pending handover ng item na ito bago i-undo ang delivery.');
    }
    const item = (await client.query('SELECT id, item_code, unit_of_measure FROM item_catalog WHERE id = $1 FOR UPDATE', [receipt.item_id])).rows[0];
    const allocation = (await client.query(
      `SELECT quantity, fulfilled_quantity FROM purchase_requisition_line_allocations
        WHERE line_id = $1 AND item_id = $2 AND status = 'Reserved' FOR UPDATE`,
      [line.id, receipt.item_id],
    )).rows[0];
    const quantity = Number(receipt.quantity);
    if (!allocation || Number(allocation.quantity) - Number(allocation.fulfilled_quantity) < quantity) {
      throw httpError(409, 'Na-issue na ang ilan sa units ng delivery na ito, kaya hindi na ito ma-undo.');
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
    const routeStatus = reservedAfter > Number(line.issued_quantity)
      ? Number(line.issued_quantity) > 0 ? 'PARTIALLY_ISSUED' : 'PARTIAL_STOCK'
      : 'WAITING_FOR_PURCHASE';
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

// The GSO Head decides only the items GSO Staff sent up; staff-routed items are left as they are.
async function reviewPurchaseRequisition({ id, action, decisions, note, changedBy }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = (await client.query(
      'SELECT id, request_type, status FROM service_requests WHERE id = $1 FOR UPDATE',
      [id],
    )).rows[0];
    if (!current || current.request_type !== 'PURCHASE_REQUISITION') throw httpError(404, 'Hindi makita ang purchase requisition.');
    const pending = (await client.query(
      `SELECT * FROM purchase_requisition_lines
        WHERE request_id = $1 AND route_status = 'WAITING_GSO_HEAD'
        ORDER BY line_number
        FOR UPDATE`,
      [id],
    )).rows;
    if (current.status !== 'Under Review' || pending.length === 0) {
      throw httpError(409, 'Walang item na naghihintay ng approval mo sa requisition na ito. I-refresh ang listahan.');
    }

    let historyNote;
    if (action === 'NEEDS_INFORMATION') {
      for (const line of pending) {
        await releasePurchaseLineStock(client, line.id);
        await client.query(
          `UPDATE purchase_requisition_lines
              SET route_status = 'NEEDS_INFORMATION', reserved_quantity = 0, finance_quantity = 0,
                  review_note = $2, updated_at = NOW()
            WHERE id = $1`,
          [line.id, note],
        );
      }
      historyNote = `GSO Head asked the requester for more details: ${note}`;
    } else {
      const decisionByLine = new Map(decisions.map((decision) => [decision.lineId, decision]));
      if (decisionByLine.size !== pending.length || pending.some((line) => !decisionByLine.has(String(line.id)))) {
        throw httpError(409, 'Magpasya para sa bawat item na naghihintay ng approval. I-refresh kung may nagbago.');
      }
      const approved = [];
      const declined = [];
      for (const line of pending) {
        const decision = decisionByLine.get(String(line.id));
        if (decision.decision === 'APPROVE') {
          // Reserved units go to GSO Staff; any shortage waits for the Finance handoff.
          const routeStatus = Number(line.finance_quantity) > 0
            ? Number(line.reserved_quantity) > 0 ? 'PARTIAL_STOCK' : 'WAITING_FINANCE'
            : 'READY_FOR_STAFF';
          await client.query(
            'UPDATE purchase_requisition_lines SET route_status = $2, review_note = $3, updated_at = NOW() WHERE id = $1',
            [line.id, routeStatus, decision.note],
          );
          approved.push(line.item_name);
        } else {
          await releasePurchaseLineStock(client, line.id);
          await client.query(
            `UPDATE purchase_requisition_lines
                SET route_status = 'REJECTED', reserved_quantity = 0, finance_quantity = 0,
                    review_note = $2, updated_at = NOW()
              WHERE id = $1`,
            [line.id, decision.note],
          );
          declined.push(`${line.item_name} (${decision.note})`);
        }
      }
      historyNote = [
        approved.length && `GSO Head approved: ${approved.join(', ')}.`,
        declined.length && `Declined: ${declined.join('; ')}.`,
      ].filter(Boolean).join(' ');
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

async function beginFinanceHandoff({ id, financeEmail, changedBy }) {
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
      throw Object.assign(new Error('Hindi makita ang purchase requisition.'), { status: 404 });
    }
    if (!['GSO Endorsed', 'Finance Handoff Failed'].includes(current.status)) {
      throw Object.assign(new Error('I-endorse muna ang purchase requisition bago ipadala sa Finance.'), { status: 409 });
    }
    const shortage = await client.query(
      `SELECT COUNT(*)::INTEGER AS count FROM purchase_requisition_lines
        WHERE request_id = $1 AND finance_quantity > 0`,
      [id],
    );
    if (!shortage.rows[0]?.count) throw Object.assign(new Error('Walang item o quantity na naka-endorse sa Finance.'), { status: 409 });

    await client.query(
      `UPDATE service_requests
          SET status = 'Finance Handoff Pending',
              finance_email = $2,
              finance_sent_at = NULL,
              finance_message_id = NULL,
              updated_at = NOW()
        WHERE id = $1`,
      [id, financeEmail],
    );
    await client.query(
      `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
       VALUES ($1, $2, 'Finance Handoff Pending', $3, $4)`,
      [id, current.status, `GSO Head started email handoff to ${financeEmail}.`, changedBy],
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

async function completeFinanceHandoff({ id, messageId, changedBy }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT id, status, finance_email
         FROM service_requests
        WHERE id = $1
        FOR UPDATE`,
      [id],
    );
    const current = currentResult.rows[0];
    if (!current || current.status !== 'Finance Handoff Pending') {
      throw Object.assign(new Error('Nagbago ang handoff state. I-refresh muna ang queue.'), { status: 409 });
    }
    await client.query(
      `UPDATE service_requests
          SET status = 'Sent to Finance', finance_sent_at = NOW(),
              finance_message_id = $2, updated_at = NOW()
        WHERE id = $1`,
      [id, messageId || null],
    );
    await client.query(
      `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
       VALUES ($1, 'Finance Handoff Pending', 'Sent to Finance', $2, $3)`,
      [id, `Purchase requisition emailed to Finance (${current.finance_email}).`, changedBy],
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

async function failFinanceHandoff({ id, changedBy }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT id, status
         FROM service_requests
        WHERE id = $1
        FOR UPDATE`,
      [id],
    );
    const current = currentResult.rows[0];
    if (!current || current.status !== 'Finance Handoff Pending') {
      await client.query('COMMIT');
      return null;
    }
    await client.query(
      `UPDATE service_requests SET status = 'Finance Handoff Failed', updated_at = NOW() WHERE id = $1`,
      [id],
    );
    await client.query(
      `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
       VALUES ($1, 'Finance Handoff Pending', 'Finance Handoff Failed', $2, $3)`,
      [id, 'Finance email could not be delivered. GSO Head may retry the handoff.', changedBy],
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

async function releasePurchaseLineStock(client, lineId) {
  await client.query(
    `UPDATE purchase_requisition_line_allocations
        SET status = 'Released', updated_at = NOW()
      WHERE line_id = $1 AND status = 'Reserved'`,
    [lineId],
  );
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
      if (inventory.rowCount !== itemIds.length) throw Object.assign(new Error('May item na wala na sa inventory.'), { status: 400 });
      const inventoryById = new Map(inventory.rows.map((item) => [String(item.id), item]));
      items = formData.items.map((requested) => {
        const item = inventoryById.get(requested.itemId);
        if (!item || item.tracking_mode !== 'quantity' || item.issue_behavior !== 'returnable'
          || ['Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired'].includes(item.condition)) {
          throw Object.assign(new Error('Hindi available para hiramin ang isa sa mga napiling item.'), { status: 409 });
        }
        return { ...requested, inventoryItem: item };
      });
      for (const requested of items) {
        const available = await availableForBorrowing(client, requested.inventoryItem);
        if (requested.quantity > available) {
          throw Object.assign(new Error(`Hindi sapat ang available quantity ng ${requested.inventoryItem.name}. Available: ${available}.`), { status: 409 });
        }
      }
    }

    const sequence = await client.query("SELECT nextval('service_request_reference_seq')::TEXT AS value");
    const referenceNo = `REQ-${new Date().getFullYear()}-${String(sequence.rows[0].value).padStart(5, '0')}`;
    const title = requestTitle(requestType, formData);
    const created = await client.query(
      `INSERT INTO service_requests (reference_no, request_type, title, form_data, requested_by_user_id)
       VALUES ($1, $2, $3, $4::JSONB, $5)
       RETURNING id`,
      [referenceNo, requestType, title, JSON.stringify(formData), userId],
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

async function setStatus({ id, expectedStatus, status, note, changedBy, dueDate, conditionOut, conditionIn, conditionsIn = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      'SELECT id, request_type, status, form_data FROM service_requests WHERE id = $1 FOR UPDATE',
      [id],
    );
    const current = currentResult.rows[0];
    if (!current) throw Object.assign(new Error('Hindi makita ang request.'), { status: 404 });
    if (current.status !== expectedStatus) throw Object.assign(new Error('Nagbago na ang status ng request. I-refresh muna ang queue.'), { status: 409 });

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
          throw Object.assign(new Error(`Hindi maaaring i-approve ang ${requested.item_name || requested.description}; hindi na ito available.`), { status: 409 });
        }
        const available = await availableForBorrowing(client, requested);
        if (Number(requested.quantity) > available) {
          throw Object.assign(new Error(`Hindi sapat ang available quantity ng ${requested.item_name || requested.description}. Available: ${available}.`), { status: 409 });
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
            AND status = 'Approved'
            AND lower(form_data->>'venue') = lower($2)
            AND form_data->>'date' = $3
            AND form_data->>'startTime' < $5
            AND form_data->>'endTime' > $4
          LIMIT 1`,
        [id, facility.venue, facility.date, facility.startTime, facility.endTime],
      );
      if (conflict.rowCount) {
        throw Object.assign(new Error(`May naka-approve nang request para sa venue at oras na ito (${conflict.rows[0].reference_no}).`), { status: 409 });
      }
    }

    await client.query(
      `UPDATE service_requests
          SET status = $2,
              updated_at = NOW(),
              completed_at = CASE WHEN $2 IN ('Returned', 'Completed', 'Closed', 'Rejected', 'Cancelled') THEN NOW() ELSE NULL END
        WHERE id = $1`,
      [id, status],
    );
    if (current.request_type === 'BORROWING' && status === 'Issued') {
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
    if (current.request_type === 'BORROWING') {
      const linkedItems = await client.query('SELECT DISTINCT item_id FROM service_request_assets WHERE request_id = $1', [id]);
      for (const item of linkedItems.rows) await refreshInventoryStatus(client, item.item_id);
    }
    await client.query(
      `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, current.status, status, note || '', changedBy],
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
    if (!current) throw Object.assign(new Error('Hindi makita ang request.'), { status: 404 });
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
    if (!current) throw Object.assign(new Error('Hindi makita ang request.'), { status: 404 });
    if (current.status !== expectedStatus) throw Object.assign(new Error('Nagbago na ang status ng request. I-refresh muna ang page.'), { status: 409 });
    if (status === 'Cancelled' && current.request_type === 'PURCHASE_REQUISITION') {
      const activeResult = await client.query(
        `SELECT EXISTS (
           SELECT 1 FROM purchase_requisition_lines
            WHERE request_id = $1 AND (issued_quantity > 0 OR route_status IN ('HANDOVER_PENDING', 'ISSUED'))
         ) AS has_issued_lines`,
        [id],
      );
      if (activeResult.rows[0]?.has_issued_lines) {
        throw Object.assign(new Error('Hindi na makakansela ang request kapag may item nang na-release o nasa handover.'), { status: 409 });
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
  listPurchaseItemNames,
  listPurchaseItemNamesByIds,
  listCatalogItemsByIds,
  getById,
  listMine,
  getMineById,
  listAll,
  listPurchaseRequisitions,
  listStaffPurchaseRequisitions,
  attachStaffStockChecks,
  staffReviewPurchaseRequisition,
  listAwaitingDeliveries,
  recordPurchaseDeliveries,
  undoPurchaseDelivery,
  createRequest,
  setStatus,
  reviewPurchaseRequisition,
  beginFinanceHandoff,
  completeFinanceHandoff,
  failFinanceHandoff,
  respondToRequest,
  changeMineStatus,
};
