-- Request Center: service requests with their assets and history, Job / Service work orders, and the audit log.
-- Consolidated from the pre-consolidation migrations (archived in migrations_archive/pre-consolidation-2026-11-15).
-- Reference data is included. One-time data conversions are not, because a new database has no rows to convert.
BEGIN;

CREATE SEQUENCE public.service_request_reference_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE public.inventory_change_logs (
    id bigint NOT NULL,
    entity_type text NOT NULL,
    entity_key text NOT NULL,
    entity_name text NOT NULL,
    item_id bigint,
    category_id bigint,
    employee_id bigint,
    action text NOT NULL,
    reason text NOT NULL,
    old_values jsonb DEFAULT '{}'::jsonb NOT NULL,
    new_values jsonb DEFAULT '{}'::jsonb NOT NULL,
    changed_by_user_id bigint,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    flag text,
    request_id bigint,
    CONSTRAINT inventory_change_logs_action_check CHECK ((action = ANY (ARRAY['created'::text, 'updated'::text, 'renamed'::text, 'deleted'::text, 'requested'::text, 'issued'::text, 'returned'::text, 'received'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text, 'moved'::text]))),
    CONSTRAINT inventory_change_logs_entity_type_check CHECK ((entity_type = ANY (ARRAY['item'::text, 'category'::text, 'employee'::text, 'request'::text, 'signature'::text, 'facility_option'::text]))),
    CONSTRAINT inventory_change_logs_flag_check CHECK (((flag IS NULL) OR (flag = ANY (ARRAY['MANUAL_ENTRY'::text, 'ITEM_LOST'::text, 'DELIVERY_UNDONE'::text, 'RECORD_DELETED'::text, 'LABEL_REPRINT'::text, 'FINANCE_PDF_REPRINT'::text])))),
    CONSTRAINT inventory_change_logs_reason_not_blank CHECK ((length(TRIM(BOTH FROM reason)) > 0))
);

CREATE TABLE public.service_request_assets (
    id bigint NOT NULL,
    request_id bigint NOT NULL,
    item_id bigint NOT NULL,
    quantity integer NOT NULL,
    unit_of_measure text NOT NULL,
    condition_out text,
    condition_in text,
    due_date date,
    issued_at timestamp with time zone,
    returned_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    returned_quantity integer DEFAULT 0 NOT NULL,
    lost_quantity integer DEFAULT 0 NOT NULL,
    returned_by_user_id bigint,
    settlement_status text,
    settlement_note text,
    settled_at timestamp with time zone,
    settled_by_user_id bigint,
    damaged_quantity integer DEFAULT 0 NOT NULL,
    CONSTRAINT service_request_assets_condition_in_check CHECK (((condition_in IS NULL) OR (condition_in = ANY (ARRAY['New'::text, 'Good'::text, 'Fair'::text, 'Needs Repair'::text, 'Under Maintenance'::text, 'Unserviceable'::text, 'Retired'::text])))),
    CONSTRAINT service_request_assets_condition_out_check CHECK (((condition_out IS NULL) OR (condition_out = ANY (ARRAY['New'::text, 'Good'::text, 'Fair'::text, 'Needs Repair'::text, 'Under Maintenance'::text, 'Unserviceable'::text, 'Retired'::text])))),
    CONSTRAINT service_request_assets_damaged_check CHECK (((damaged_quantity >= 0) AND (damaged_quantity <= returned_quantity))),
    CONSTRAINT service_request_assets_quantity_positive CHECK ((quantity > 0)),
    CONSTRAINT service_request_assets_return_counts_check CHECK (((returned_quantity >= 0) AND (lost_quantity >= 0) AND ((returned_quantity + lost_quantity) <= quantity))),
    CONSTRAINT service_request_assets_settlement_check CHECK (((settlement_status IS NULL) OR (settlement_status = ANY (ARRAY['Pending'::text, 'Replaced'::text, 'Paid'::text, 'Waived'::text])))),
    CONSTRAINT service_request_assets_unit_not_blank CHECK ((length(TRIM(BOTH FROM unit_of_measure)) > 0))
);

CREATE TABLE public.service_request_history (
    id bigint NOT NULL,
    request_id bigint NOT NULL,
    previous_status text,
    new_status text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    changed_by_user_id bigint,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT service_request_history_note_length CHECK ((length(note) <= 2000))
);

CREATE TABLE public.service_requests (
    id bigint NOT NULL,
    reference_no text NOT NULL,
    request_type text NOT NULL,
    title text NOT NULL,
    form_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'Submitted'::text NOT NULL,
    requested_by_user_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    gso_head_endorsed_by_user_id bigint,
    gso_head_endorsed_at timestamp with time zone,
    finance_email text,
    finance_sent_at timestamp with time zone,
    finance_message_id text,
    finance_decision text,
    finance_reference text,
    finance_response_note text,
    finance_response_at timestamp with time zone,
    finance_response_by_user_id bigint,
    staff_reviewed_by_user_id bigint,
    staff_reviewed_at timestamp with time zone,
    staff_review_note text DEFAULT ''::text NOT NULL,
    slip_printed_at timestamp with time zone,
    slip_printed_by_user_id bigint,
    overdue_reminded_at timestamp with time zone,
    CONSTRAINT service_requests_finance_decision_check CHECK (((finance_decision IS NULL) OR (finance_decision = ANY (ARRAY['Approved'::text, 'Needs Changes'::text, 'Rejected'::text])))),
    CONSTRAINT service_requests_finance_response_note_length CHECK (((finance_response_note IS NULL) OR (length(finance_response_note) <= 2000))),
    CONSTRAINT service_requests_reference_not_blank CHECK ((length(TRIM(BOTH FROM reference_no)) > 0)),
    CONSTRAINT service_requests_staff_review_note_length CHECK ((length(staff_review_note) <= 2000)),
    CONSTRAINT service_requests_status_check CHECK ((status = ANY (ARRAY['Submitted'::text, 'Under Review'::text, 'Needs Information'::text, 'Approved'::text, 'Rejected'::text, 'Ready for Pickup'::text, 'Issued'::text, 'Return Requested'::text, 'Returned'::text, 'For Repair'::text, 'In Progress'::text, 'Completed'::text, 'Awaiting Requester Confirmation'::text, 'Closed'::text, 'Cancelled'::text, 'GSO Endorsed'::text, 'Finance Handoff Pending'::text, 'Finance Handoff Failed'::text, 'Sent to Finance'::text]))),
    CONSTRAINT service_requests_title_not_blank CHECK ((length(TRIM(BOTH FROM title)) > 0)),
    CONSTRAINT service_requests_type_check CHECK ((request_type = ANY (ARRAY['BORROWING'::text, 'FACILITY_USE'::text, 'JOB_REQUEST'::text, 'PURCHASE_REQUISITION'::text, 'LOSS_DAMAGE_REPORT'::text, 'ISSUANCE_REQUEST'::text])))
);

CREATE TABLE public.service_work_order_tasks (
    id bigint NOT NULL,
    request_id bigint NOT NULL,
    task_number integer NOT NULL,
    quantity integer NOT NULL,
    particulars text NOT NULL,
    nature_of_work text NOT NULL,
    remarks text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'Open'::text NOT NULL,
    completion_note text DEFAULT ''::text NOT NULL,
    completed_at timestamp with time zone,
    completed_by_user_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT service_work_order_tasks_number_check CHECK ((task_number > 0)),
    CONSTRAINT service_work_order_tasks_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT service_work_order_tasks_status_check CHECK ((status = ANY (ARRAY['Open'::text, 'Completed'::text]))),
    CONSTRAINT service_work_order_tasks_text_check CHECK (((length(TRIM(BOTH FROM particulars)) > 0) AND (length(TRIM(BOTH FROM nature_of_work)) > 0) AND (length(remarks) <= 500) AND (length(completion_note) <= 1000)))
);

CREATE TABLE public.service_work_orders (
    request_id bigint NOT NULL,
    route_team text NOT NULL,
    service_category text NOT NULL,
    priority text NOT NULL,
    target_date date,
    assigned_user_id bigint,
    claimed_at timestamp with time zone,
    reviewed_at timestamp with time zone,
    started_at timestamp with time zone,
    work_completed_at timestamp with time zone,
    awaiting_confirmation_at timestamp with time zone,
    auto_close_at timestamp with time zone,
    requester_confirmed_at timestamp with time zone,
    closed_at timestamp with time zone,
    closed_by_user_id bigint,
    closure_type text,
    last_reminder_on date,
    requester_reminded_at timestamp with time zone,
    completion_note text DEFAULT ''::text NOT NULL,
    incomplete_reason text DEFAULT ''::text NOT NULL,
    reopen_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT service_work_orders_category_check CHECK ((service_category = ANY (ARRAY['ELECTRICAL_LIGHTING'::text, 'PLUMBING_WATER'::text, 'FURNITURE_CARPENTRY'::text, 'BUILDING_REPAIR'::text, 'CLEANING_SANITATION'::text, 'EVENT_SETUP_MOVING'::text, 'SAFETY_HAZARD'::text, 'COMPUTER_DEVICE'::text, 'NETWORK_CONNECTIVITY'::text, 'SOFTWARE_ACCESS'::text, 'PERIPHERALS_PRINTING'::text, 'OTHER_GENERAL'::text, 'OTHERS'::text]))),
    CONSTRAINT service_work_orders_closure_type_check CHECK (((closure_type IS NULL) OR (closure_type = ANY (ARRAY['REQUESTER_CONFIRMED'::text, 'AUTO_CLOSED'::text, 'STAFF_CLOSED'::text, 'REJECTED'::text])))),
    CONSTRAINT service_work_orders_note_length_check CHECK (((length(completion_note) <= 2000) AND (length(incomplete_reason) <= 2000))),
    CONSTRAINT service_work_orders_priority_check CHECK ((priority = ANY (ARRAY['URGENT'::text, 'HIGH'::text, 'STANDARD'::text]))),
    CONSTRAINT service_work_orders_reopen_count_check CHECK ((reopen_count >= 0)),
    CONSTRAINT service_work_orders_team_check CHECK ((route_team = ANY (ARRAY['GSO'::text, 'ITSS'::text])))
);

ALTER TABLE public.inventory_change_logs ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.inventory_change_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.service_request_assets ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.service_request_assets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.service_request_history ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.service_request_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.service_requests ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.service_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.service_work_order_tasks ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.service_work_order_tasks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.inventory_change_logs
    ADD CONSTRAINT inventory_change_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.service_request_assets
    ADD CONSTRAINT service_request_assets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.service_request_history
    ADD CONSTRAINT service_request_history_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_reference_no_key UNIQUE (reference_no);

ALTER TABLE ONLY public.service_work_order_tasks
    ADD CONSTRAINT service_work_order_tasks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.service_work_order_tasks
    ADD CONSTRAINT service_work_order_tasks_request_number_unique UNIQUE (request_id, task_number);

ALTER TABLE ONLY public.service_work_orders
    ADD CONSTRAINT service_work_orders_pkey PRIMARY KEY (request_id);

CREATE INDEX inventory_change_logs_category_changed_at_idx ON public.inventory_change_logs USING btree (category_id, changed_at DESC);

CREATE INDEX inventory_change_logs_changed_at_idx ON public.inventory_change_logs USING btree (changed_at DESC, id DESC);

CREATE INDEX inventory_change_logs_employee_changed_at_idx ON public.inventory_change_logs USING btree (employee_id, changed_at DESC);

CREATE INDEX inventory_change_logs_flag_changed_at_idx ON public.inventory_change_logs USING btree (changed_at DESC, id DESC) WHERE (flag IS NOT NULL);

CREATE INDEX inventory_change_logs_item_changed_at_idx ON public.inventory_change_logs USING btree (item_id, changed_at DESC);

CREATE INDEX inventory_change_logs_request_changed_at_idx ON public.inventory_change_logs USING btree (request_id, changed_at DESC);

CREATE INDEX service_request_assets_item_idx ON public.service_request_assets USING btree (item_id, request_id);

CREATE INDEX service_request_assets_pending_settlement_idx ON public.service_request_assets USING btree (request_id) WHERE (settlement_status = 'Pending'::text);

CREATE INDEX service_request_assets_request_idx ON public.service_request_assets USING btree (request_id, id);

CREATE INDEX service_request_history_request_changed_idx ON public.service_request_history USING btree (request_id, changed_at DESC, id DESC);

CREATE INDEX service_requests_purchase_finance_status_idx ON public.service_requests USING btree (status, created_at DESC, id DESC) WHERE (request_type = 'PURCHASE_REQUISITION'::text);

CREATE INDEX service_requests_requester_created_idx ON public.service_requests USING btree (requested_by_user_id, created_at DESC, id DESC);

CREATE INDEX service_requests_status_created_idx ON public.service_requests USING btree (status, created_at DESC, id DESC);

CREATE INDEX service_requests_type_status_created_idx ON public.service_requests USING btree (request_type, status, created_at DESC, id DESC);

CREATE INDEX service_work_order_tasks_request_status_idx ON public.service_work_order_tasks USING btree (request_id, status, task_number);

CREATE INDEX service_work_orders_assigned_idx ON public.service_work_orders USING btree (assigned_user_id, target_date, request_id) WHERE (assigned_user_id IS NOT NULL);

CREATE INDEX service_work_orders_auto_close_idx ON public.service_work_orders USING btree (auto_close_at, request_id) WHERE (auto_close_at IS NOT NULL);

CREATE INDEX service_work_orders_route_status_target_idx ON public.service_work_orders USING btree (route_team, target_date, request_id);

ALTER TABLE ONLY public.inventory_change_logs
    ADD CONSTRAINT inventory_change_logs_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.item_categories(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.inventory_change_logs
    ADD CONSTRAINT inventory_change_logs_changed_by_user_id_fkey FOREIGN KEY (changed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.inventory_change_logs
    ADD CONSTRAINT inventory_change_logs_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.inventory_change_logs
    ADD CONSTRAINT inventory_change_logs_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.item_catalog(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.inventory_change_logs
    ADD CONSTRAINT inventory_change_logs_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.service_request_assets
    ADD CONSTRAINT service_request_assets_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.item_catalog(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.service_request_assets
    ADD CONSTRAINT service_request_assets_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.service_request_assets
    ADD CONSTRAINT service_request_assets_returned_by_user_id_fkey FOREIGN KEY (returned_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.service_request_assets
    ADD CONSTRAINT service_request_assets_settled_by_user_id_fkey FOREIGN KEY (settled_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.service_request_history
    ADD CONSTRAINT service_request_history_changed_by_user_id_fkey FOREIGN KEY (changed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.service_request_history
    ADD CONSTRAINT service_request_history_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_finance_response_by_user_id_fkey FOREIGN KEY (finance_response_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_gso_head_endorsed_by_user_id_fkey FOREIGN KEY (gso_head_endorsed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_slip_printed_by_user_id_fkey FOREIGN KEY (slip_printed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_staff_reviewed_by_user_id_fkey FOREIGN KEY (staff_reviewed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.service_work_order_tasks
    ADD CONSTRAINT service_work_order_tasks_completed_by_user_id_fkey FOREIGN KEY (completed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.service_work_order_tasks
    ADD CONSTRAINT service_work_order_tasks_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_work_orders(request_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.service_work_orders
    ADD CONSTRAINT service_work_orders_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.service_work_orders
    ADD CONSTRAINT service_work_orders_closed_by_user_id_fkey FOREIGN KEY (closed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.service_work_orders
    ADD CONSTRAINT service_work_orders_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE;

COMMIT;
