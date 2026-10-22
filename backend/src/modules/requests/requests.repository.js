const pool = require('../../config/db');
const { refreshInventoryStatus } = require('../inventory/inventory.stock');

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
            GREATEST(item.quantity - COALESCE(employee_usage.active_quantity, 0) - COALESCE(borrower_usage.active_quantity, 0), 0)::INTEGER AS "availableQuantity"
       FROM item_catalog AS item
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(issue.quantity) FILTER (WHERE issue.status = 'Pending'), 0)
              + COALESCE(SUM(issue.quantity - issue.returned_quantity) FILTER (WHERE issue.status = 'Issued'), 0) AS active_quantity
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
  return result.rows.filter((item) => Number(item.availableQuantity) > 0);
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
  const filters = [];
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

function requestTitle(requestType, formData) {
  if (requestType === 'BORROWING') return `Asset borrowing: ${formData.items.length} item${formData.items.length === 1 ? '' : 's'}`;
  if (requestType === 'FACILITY_USE') return `Facility use: ${formData.activity}`;
  if (requestType === 'JOB_REQUEST') return `Job request: ${formData.departmentOrganization}`;
  if (requestType === 'PURCHASE_REQUISITION') return `Purchase requisition: ${formData.category}`;
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

async function createRequest({ requestType, formData, userId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let items = [];
    if (requestType === 'BORROWING') {
      const itemIds = formData.items.map((item) => item.itemId).sort((a, b) => Number(a) - Number(b));
      const inventory = await client.query(
        `SELECT id, item_code, COALESCE(NULLIF(item_name, ''), description) AS name,
                unit_of_measure, condition, inventory_status, quantity
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
        if (!item || ['Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired'].includes(item.condition)) {
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
    for (const requested of items) {
      await client.query(
        `INSERT INTO service_request_assets (request_id, item_id, quantity, unit_of_measure)
         VALUES ($1, $2, $3, $4)`,
        [requestId, requested.itemId, requested.quantity, requested.inventoryItem.unit_of_measure],
      );
    }
    await client.query(
      `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
       VALUES ($1, NULL, 'Submitted', 'Request submitted.', $2)`,
      [requestId, userId],
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

async function setStatus({ id, expectedStatus, status, note, changedBy, dueDate, conditionOut, conditionIn }) {
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
    if (current.request_type === 'BORROWING' && ['Returned', 'For Repair'].includes(status)) {
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
      `SELECT id, status, form_data FROM service_requests
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
      `SELECT id, status FROM service_requests
        WHERE id = $1 AND requested_by_user_id = $2
        FOR UPDATE`,
      [id, userId],
    );
    const current = result.rows[0];
    if (!current) throw Object.assign(new Error('Hindi makita ang request.'), { status: 404 });
    if (current.status !== expectedStatus) throw Object.assign(new Error('Nagbago na ang status ng request. I-refresh muna ang page.'), { status: 409 });
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

module.exports = { listAssets, getById, listMine, getMineById, listAll, createRequest, setStatus, respondToRequest, changeMineStatus };
