const pool = require('../../config/db');

const httpError = (status, message) => Object.assign(new Error(message), { status });

const WORK_ORDER_SELECT = `
  SELECT request.id::TEXT AS id,
         request.reference_no AS "referenceNo",
         request.title,
         request.status,
         request.form_data AS "formData",
         request.created_at AS "createdAt",
         request.updated_at AS "updatedAt",
         request.completed_at AS "requestClosedAt",
         work.route_team AS "routeTeam",
         work.service_category AS "serviceCategory",
         work.priority,
         to_char(work.target_date, 'YYYY-MM-DD') AS "targetDate",
         work.assigned_user_id::TEXT AS "assignedStaffId",
         assigned.name AS "assignedStaffName",
         assigned.email AS "assignedStaffEmail",
         work.claimed_at AS "claimedAt",
         work.reviewed_at AS "reviewedAt",
         work.started_at AS "startedAt",
         work.work_completed_at AS "workCompletedAt",
         work.awaiting_confirmation_at AS "awaitingConfirmationAt",
         work.auto_close_at AS "autoCloseAt",
         work.requester_confirmed_at AS "requesterConfirmedAt",
         work.closed_at AS "closedAt",
         work.closure_type AS "closureType",
         work.completion_note AS "completionNote",
         work.incomplete_reason AS "incompleteReason",
         work.reopen_count AS "reopenCount",
         requester.id::TEXT AS "requesterId",
         requester.name AS "requesterName",
         requester.email AS "requesterEmail",
         COALESCE((
           SELECT json_agg(json_build_object(
             'id', task.id::TEXT,
             'taskNumber', task.task_number,
             'quantity', task.quantity,
             'particulars', task.particulars,
             'natureOfWork', task.nature_of_work,
             'remarks', task.remarks,
             'status', task.status,
             'completed', task.status = 'Completed',
             'note', task.completion_note,
             'completedAt', task.completed_at,
             'completedBy', completer.name
           ) ORDER BY task.task_number, task.id)
             FROM service_work_order_tasks AS task
             LEFT JOIN users AS completer ON completer.id = task.completed_by_user_id
            WHERE task.request_id = work.request_id
         ), '[]'::JSON) AS tasks,
         COALESCE((
           SELECT json_agg(json_build_object(
             'id', event.id::TEXT,
             'previousStatus', event.previous_status,
             'status', event.new_status,
             'note', event.note,
             'changedBy', editor.name,
             'changedAt', event.changed_at
           ) ORDER BY event.changed_at, event.id)
             FROM service_request_history AS event
             LEFT JOIN users AS editor ON editor.id = event.changed_by_user_id
            WHERE event.request_id = request.id
         ), '[]'::JSON) AS history
    FROM service_requests AS request
    JOIN service_work_orders AS work ON work.request_id = request.id
    JOIN users AS requester ON requester.id = request.requested_by_user_id
    LEFT JOIN users AS assigned ON assigned.id = work.assigned_user_id`;

const LOCKED_WORK_ORDER_SELECT = `
  SELECT request.id::TEXT AS id,
         request.reference_no AS "referenceNo",
         request.request_type AS "requestType",
         request.status,
         request.form_data AS "formData",
         request.requested_by_user_id::TEXT AS "requesterId",
         work.route_team AS "routeTeam",
         work.service_category AS "serviceCategory",
         work.priority,
         to_char(work.target_date, 'YYYY-MM-DD') AS "targetDate",
         work.assigned_user_id::TEXT AS "assignedStaffId",
         work.claimed_at AS "claimedAt",
         work.reviewed_at AS "reviewedAt",
         work.started_at AS "startedAt",
         work.work_completed_at AS "workCompletedAt",
         work.awaiting_confirmation_at AS "awaitingConfirmationAt",
         work.auto_close_at AS "autoCloseAt",
         work.completion_note AS "completionNote",
         work.incomplete_reason AS "incompleteReason",
         work.reopen_count AS "reopenCount"
    FROM service_requests AS request
    JOIN service_work_orders AS work ON work.request_id = request.id
   WHERE request.id = $1 AND request.request_type = 'JOB_REQUEST'
   FOR UPDATE OF request, work`;

const WORK_ORDER_COLUMNS = Object.freeze({
  routeTeam: 'route_team',
  serviceCategory: 'service_category',
  priority: 'priority',
  targetDate: 'target_date',
  assignedStaffId: 'assigned_user_id',
  claimedAt: 'claimed_at',
  reviewedAt: 'reviewed_at',
  startedAt: 'started_at',
  workCompletedAt: 'work_completed_at',
  awaitingConfirmationAt: 'awaiting_confirmation_at',
  autoCloseAt: 'auto_close_at',
  requesterConfirmedAt: 'requester_confirmed_at',
  closedAt: 'closed_at',
  closedByUserId: 'closed_by_user_id',
  closureType: 'closure_type',
  completionNote: 'completion_note',
  incompleteReason: 'incomplete_reason',
  reopenCount: 'reopen_count',
  lastReminderOn: 'last_reminder_on',
  requesterRemindedAt: 'requester_reminded_at',
});

// Same rule as priorityForService (service-work-order.constants.js), applied at query time so an open job
// moves up to Urgent or High as its target date approaches.
const PRIORITY_RANK_SQL = `CASE
  WHEN work.service_category = 'SAFETY_HAZARD' THEN 0
  WHEN work.target_date <= (NOW() AT TIME ZONE 'Asia/Manila')::DATE + 1 THEN 0
  WHEN work.target_date <= (NOW() AT TIME ZONE 'Asia/Manila')::DATE + 3 THEN 1
  ELSE 2 END`;

function queueCondition(queue, values, userId) {
  switch (queue) {
    case 'NEW':
      return "request.status = 'Submitted' AND work.assigned_user_id IS NULL";
    case 'UNDER_REVIEW':
      return "request.status IN ('Under Review', 'Needs Information')";
    case 'MY_ACTIVE':
      values.push(userId);
      return `work.assigned_user_id = $${values.length} AND request.status IN ('Submitted', 'Under Review', 'Needs Information', 'In Progress')`;
    case 'DUE_TODAY':
      return "work.target_date = (NOW() AT TIME ZONE 'Asia/Manila')::DATE AND request.status IN ('Submitted', 'Under Review', 'Needs Information', 'In Progress')";
    case 'OVERDUE':
      return "work.target_date < (NOW() AT TIME ZONE 'Asia/Manila')::DATE AND request.status IN ('Submitted', 'Under Review', 'Needs Information', 'In Progress')";
    case 'AWAITING_CONFIRMATION':
      return "request.status = 'Awaiting Requester Confirmation'";
    case 'CLOSED':
      return "request.status IN ('Closed', 'Rejected', 'Cancelled')";
    default:
      return '';
  }
}

async function createForJobRequest(client, { requestId, formData }) {
  const created = await client.query(
    `INSERT INTO service_work_orders (request_id, route_team, service_category, priority, target_date)
     VALUES ($1, $2, $3, $4, $5::DATE)
     RETURNING request_id`,
    [requestId, formData.serviceRoute, formData.serviceCategory, formData.servicePriority, formData.requiredDate],
  );
  for (const [index, task] of formData.tasks.entries()) {
    await client.query(
      `INSERT INTO service_work_order_tasks (
         request_id, task_number, quantity, particulars, nature_of_work, remarks
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [requestId, index + 1, task.quantity, task.particulars, task.natureOfWork, task.remarks || ''],
    );
  }
  return created.rows[0];
}

async function getWorkOrder(queryable, requestId) {
  const result = await (queryable || pool).query(`${WORK_ORDER_SELECT} WHERE request.id = $1`, [requestId]);
  return result.rows[0] || null;
}

async function listWorkOrders({ team, queue, search, limit, offset, userId }) {
  const values = [team];
  const filters = ["request.request_type = 'JOB_REQUEST'", 'work.route_team = $1'];
  const queueFilter = queueCondition(queue, values, userId);
  if (queueFilter) filters.push(queueFilter);
  if (search) {
    values.push(`%${search}%`);
    const parameter = `$${values.length}`;
    filters.push(`(
      request.reference_no ILIKE ${parameter}
      OR request.title ILIKE ${parameter}
      OR requester.name ILIKE ${parameter}
      OR COALESCE(request.form_data->>'location', '') ILIKE ${parameter}
      OR work.service_category ILIKE ${parameter}
      OR request.form_data::TEXT ILIKE ${parameter}
    )`);
  }
  values.push(limit, offset);
  const limitParameter = `$${values.length - 1}`;
  const offsetParameter = `$${values.length}`;
  const result = await pool.query(
    `${WORK_ORDER_SELECT}
      WHERE ${filters.join(' AND ')}
      ORDER BY ${PRIORITY_RANK_SQL},
               CASE WHEN work.target_date < (NOW() AT TIME ZONE 'Asia/Manila')::DATE
                    AND request.status IN ('Submitted', 'Under Review', 'Needs Information', 'In Progress') THEN 0 ELSE 1 END,
               work.target_date NULLS LAST, request.created_at DESC, request.id DESC
      LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
    values,
  );

  const summary = await workOrderSummary({ team, userId });
  // The total must follow the same queue as the rows, or the tab counts and the pager disagree.
  const countValues = [team];
  const countFilters = ["request.request_type = 'JOB_REQUEST'", 'work.route_team = $1'];
  const countQueueFilter = queueCondition(queue, countValues, userId);
  if (countQueueFilter) countFilters.push(countQueueFilter);
  if (search) {
    countValues.push(`%${search}%`);
    const parameter = `$${countValues.length}`;
    countFilters.push(`(request.reference_no ILIKE ${parameter} OR request.title ILIKE ${parameter} OR requester.name ILIKE ${parameter} OR request.form_data::TEXT ILIKE ${parameter})`);
  }
  const count = await pool.query(
    `SELECT COUNT(*)::INTEGER AS total
       FROM service_requests AS request
       JOIN service_work_orders AS work ON work.request_id = request.id
       JOIN users AS requester ON requester.id = request.requested_by_user_id
      WHERE ${countFilters.join(' AND ')}`,
    countValues,
  );
  return { workOrders: result.rows, summary, total: count.rows[0].total, limit, offset };
}

async function workOrderSummary({ team, userId }) {
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE request.status = 'Submitted' AND work.assigned_user_id IS NULL)::INTEGER AS "new",
       COUNT(*) FILTER (WHERE request.status IN ('Under Review', 'Needs Information'))::INTEGER AS "underReview",
       COUNT(*) FILTER (WHERE work.target_date = (NOW() AT TIME ZONE 'Asia/Manila')::DATE
                         AND request.status IN ('Submitted', 'Under Review', 'Needs Information', 'In Progress'))::INTEGER AS "dueToday",
       COUNT(*) FILTER (WHERE work.target_date < (NOW() AT TIME ZONE 'Asia/Manila')::DATE
                         AND request.status IN ('Submitted', 'Under Review', 'Needs Information', 'In Progress'))::INTEGER AS overdue,
       COUNT(*) FILTER (WHERE request.status = 'In Progress')::INTEGER AS "inProgress",
       COUNT(*) FILTER (WHERE work.assigned_user_id = $2
                         AND request.status IN ('Submitted', 'Under Review', 'Needs Information', 'In Progress'))::INTEGER AS active,
       COUNT(*) FILTER (WHERE request.status = 'Awaiting Requester Confirmation')::INTEGER AS "awaitingConfirmation",
       COUNT(*) FILTER (WHERE request.status IN ('Closed', 'Rejected', 'Cancelled'))::INTEGER AS closed,
       COUNT(*)::INTEGER AS total
      FROM service_requests AS request
      JOIN service_work_orders AS work ON work.request_id = request.id
     WHERE request.request_type = 'JOB_REQUEST' AND work.route_team = $1`,
    [team, userId],
  );
  return result.rows[0];
}

async function withLockedWorkOrder(requestId, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(LOCKED_WORK_ORDER_SELECT, [requestId]);
    const current = result.rows[0];
    if (!current) throw httpError(404, 'Service work order not found.');
    const value = await work(client, current);
    const workOrder = await getWorkOrder(client, requestId);
    await client.query('COMMIT');
    return { current, workOrder, value };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateRequestStatus(client, { requestId, status }) {
  await client.query(
    `UPDATE service_requests
        SET status = $2,
            updated_at = NOW(),
            completed_at = CASE
              WHEN $2 IN ('Closed', 'Rejected', 'Cancelled') THEN NOW()
              WHEN $2 IN ('Submitted', 'Under Review', 'Needs Information', 'In Progress', 'Awaiting Requester Confirmation') THEN NULL
              ELSE completed_at
            END
      WHERE id = $1`,
    [requestId, status],
  );
}

async function updateWorkOrder(client, requestId, values) {
  const entries = Object.entries(values).filter(([key]) => Object.hasOwn(WORK_ORDER_COLUMNS, key));
  if (!entries.length) return;
  const parameters = [requestId];
  const assignments = entries.map(([key, value]) => {
    parameters.push(value);
    return `${WORK_ORDER_COLUMNS[key]} = $${parameters.length}`;
  });
  assignments.push('updated_at = NOW()');
  await client.query(
    `UPDATE service_work_orders SET ${assignments.join(', ')} WHERE request_id = $1`,
    parameters,
  );
}

async function insertHistory(client, { requestId, previousStatus, status, note, changedByUserId }) {
  await client.query(
    `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [requestId, previousStatus, status, note || '', changedByUserId || null],
  );
}

async function updateTasks(client, { requestId, taskUpdates, changedByUserId }) {
  if (!taskUpdates.length) return;
  const existing = await client.query(
    `SELECT id::TEXT AS id FROM service_work_order_tasks
      WHERE request_id = $1 AND id = ANY($2::BIGINT[]) FOR UPDATE`,
    [requestId, taskUpdates.map((item) => item.id)],
  );
  if (existing.rowCount !== taskUpdates.length) throw httpError(409, 'One or more service tasks no longer belong to this work order. Refresh and try again.');
  for (const task of taskUpdates) {
    await client.query(
      `UPDATE service_work_order_tasks
          SET status = $3,
              completed_at = CASE WHEN $3 = 'Completed' THEN NOW() ELSE NULL END,
              completed_by_user_id = CASE WHEN $3 = 'Completed' THEN $4::BIGINT ELSE NULL END,
              completion_note = CASE WHEN $3 = 'Completed' THEN completion_note ELSE '' END,
              updated_at = NOW()
        WHERE request_id = $1 AND id = $2`,
      [requestId, task.id, task.completed ? 'Completed' : 'Open', changedByUserId],
    );
  }
}

async function countOpenTasks(client, requestId) {
  const result = await client.query(
    `SELECT COUNT(*)::INTEGER AS total
       FROM service_work_order_tasks
      WHERE request_id = $1 AND status <> 'Completed'`,
    [requestId],
  );
  return result.rows[0].total;
}

async function autoCloseEligible(limit = 25) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const candidates = await client.query(
      `SELECT request.id::TEXT AS id, request.status
         FROM service_requests AS request
         JOIN service_work_orders AS work ON work.request_id = request.id
        WHERE request.request_type = 'JOB_REQUEST'
          AND request.status = 'Awaiting Requester Confirmation'
          AND work.auto_close_at <= NOW()
        ORDER BY work.auto_close_at, request.id
        LIMIT $1
        FOR UPDATE OF request, work SKIP LOCKED`,
      [limit],
    );
    for (const row of candidates.rows) {
      await updateRequestStatus(client, { requestId: row.id, status: 'Closed' });
      await updateWorkOrder(client, row.id, {
        closedAt: new Date(),
        closureType: 'AUTO_CLOSED',
        autoCloseAt: null,
      });
      await insertHistory(client, {
        requestId: row.id,
        previousStatus: row.status,
        status: 'Closed',
        note: 'Automatically closed after 2 days without requester feedback.',
        changedByUserId: null,
      });
    }
    await client.query('COMMIT');
    return candidates.rows.map((row) => row.id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function claimReminderCandidates(limit = 25) {
  const result = await pool.query(
    `UPDATE service_work_orders AS work
        SET last_reminder_on = (NOW() AT TIME ZONE 'Asia/Manila')::DATE,
            updated_at = NOW()
      WHERE work.request_id IN (
        SELECT request.id
          FROM service_requests AS request
          JOIN service_work_orders AS candidate ON candidate.request_id = request.id
         WHERE request.request_type = 'JOB_REQUEST'
           AND request.status IN ('Submitted', 'Under Review', 'Needs Information', 'In Progress')
           AND candidate.target_date <= (NOW() AT TIME ZONE 'Asia/Manila')::DATE + 1
           AND candidate.target_date IS NOT NULL
           AND candidate.last_reminder_on IS DISTINCT FROM (NOW() AT TIME ZONE 'Asia/Manila')::DATE
         ORDER BY candidate.target_date, request.id
         LIMIT $1
         FOR UPDATE OF request, candidate SKIP LOCKED
      )
      RETURNING work.request_id::TEXT AS id`,
    [limit],
  );
  return result.rows.map((row) => row.id);
}

// One reminder to the requester, about a day before the automatic close, so a completed job is not closed unseen.
async function claimRequesterReminderCandidates(limit = 25) {
  const result = await pool.query(
    `UPDATE service_work_orders AS work
        SET requester_reminded_at = NOW(), updated_at = NOW()
      WHERE work.request_id IN (
        SELECT candidate.request_id
          FROM service_requests AS request
          JOIN service_work_orders AS candidate ON candidate.request_id = request.id
         WHERE request.request_type = 'JOB_REQUEST'
           AND request.status = 'Awaiting Requester Confirmation'
           AND candidate.requester_reminded_at IS NULL
           AND candidate.auto_close_at > NOW()
           AND candidate.auto_close_at <= NOW() + INTERVAL '1 day'
         ORDER BY candidate.auto_close_at, candidate.request_id
         LIMIT $1
         FOR UPDATE OF request, candidate SKIP LOCKED
      )
      RETURNING work.request_id::TEXT AS id`,
    [limit],
  );
  return result.rows.map((row) => row.id);
}

module.exports = {
  createForJobRequest,
  getWorkOrder,
  listWorkOrders,
  workOrderSummary,
  withLockedWorkOrder,
  updateRequestStatus,
  updateWorkOrder,
  insertHistory,
  updateTasks,
  countOpenTasks,
  autoCloseEligible,
  claimReminderCandidates,
  claimRequesterReminderCandidates,
};
