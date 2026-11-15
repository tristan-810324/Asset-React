-- Historical migration retained for databases whose schema_migrations ledger includes 028.
-- The application no longer uses these tables; do not run this file for a new deployment.

BEGIN;

ALTER TABLE service_requests
  DROP CONSTRAINT IF EXISTS service_requests_status_check;

ALTER TABLE service_requests
  ADD CONSTRAINT service_requests_status_check CHECK (status IN (
    'Submitted', 'Under Review', 'Needs Information', 'Approved', 'Rejected',
    'Ready for Pickup', 'Issued', 'Return Requested', 'Returned', 'For Repair',
    'In Progress', 'Completed', 'Awaiting Requester Confirmation', 'Closed',
    'Cancelled', 'GSO Endorsed', 'Finance Handoff Pending',
    'Finance Handoff Failed', 'Sent to Finance'
  ));

CREATE TABLE IF NOT EXISTS service_work_orders (
  request_id BIGINT PRIMARY KEY REFERENCES service_requests(id) ON DELETE CASCADE,
  route_team TEXT NOT NULL CHECK (route_team IN ('GSO', 'ITSS')),
  service_category TEXT NOT NULL CHECK (service_category IN (
    'ELECTRICAL_LIGHTING', 'PLUMBING_WATER', 'FURNITURE_CARPENTRY',
    'BUILDING_REPAIR', 'CLEANING_SANITATION', 'EVENT_SETUP_MOVING',
    'SAFETY_HAZARD', 'COMPUTER_DEVICE', 'NETWORK_CONNECTIVITY',
    'SOFTWARE_ACCESS', 'PERIPHERALS_PRINTING', 'OTHER_GENERAL'
  )),
  priority TEXT NOT NULL CHECK (priority IN ('URGENT', 'HIGH', 'STANDARD')),
  target_date DATE,
  assigned_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  work_completed_at TIMESTAMPTZ,
  awaiting_confirmation_at TIMESTAMPTZ,
  auto_close_at TIMESTAMPTZ,
  requester_confirmed_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  closed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  closure_type TEXT CHECK (closure_type IN ('REQUESTER_CONFIRMED', 'AUTO_CLOSED', 'STAFF_CLOSED', 'REJECTED')),
  last_reminder_on DATE,
  requester_reminded_at TIMESTAMPTZ,
  completion_note TEXT NOT NULL DEFAULT '' CHECK (length(completion_note) <= 2000),
  incomplete_reason TEXT NOT NULL DEFAULT '' CHECK (length(incomplete_reason) <= 2000),
  reopen_count INTEGER NOT NULL DEFAULT 0 CHECK (reopen_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_work_order_tasks (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT NOT NULL REFERENCES service_work_orders(request_id) ON DELETE CASCADE,
  task_number INTEGER NOT NULL CHECK (task_number > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  particulars TEXT NOT NULL,
  nature_of_work TEXT NOT NULL,
  remarks TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Completed')),
  completion_note TEXT NOT NULL DEFAULT '',
  completed_at TIMESTAMPTZ,
  completed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_work_order_tasks_request_number_unique UNIQUE (request_id, task_number),
  CONSTRAINT service_work_order_tasks_text_check CHECK (
    length(trim(particulars)) > 0
    AND length(trim(nature_of_work)) > 0
    AND length(remarks) <= 500
    AND length(completion_note) <= 1000
  )
);

CREATE INDEX IF NOT EXISTS service_work_orders_route_status_target_idx
  ON service_work_orders (route_team, target_date, request_id);
CREATE INDEX IF NOT EXISTS service_work_orders_assigned_idx
  ON service_work_orders (assigned_user_id, target_date, request_id)
  WHERE assigned_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_work_orders_auto_close_idx
  ON service_work_orders (auto_close_at, request_id)
  WHERE auto_close_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_work_order_tasks_request_status_idx
  ON service_work_order_tasks (request_id, status, task_number);

COMMIT;
