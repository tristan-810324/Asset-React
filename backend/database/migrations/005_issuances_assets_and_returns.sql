-- Issuing stock to employees and borrowing, barcode tags per unit, label reprints, returns, and return codes.
-- Consolidated from the pre-consolidation migrations (archived in migrations_archive/pre-consolidation-2026-11-15).
-- Reference data is included. One-time data conversions are not, because a new database has no rows to convert.
BEGIN;

CREATE TABLE public.asset_label_reprints (
    id bigint NOT NULL,
    asset_unit_tag_id bigint NOT NULL,
    old_tag_code text NOT NULL,
    new_tag_code text NOT NULL,
    label_version integer NOT NULL,
    kind text DEFAULT 'reprint'::text NOT NULL,
    reason text NOT NULL,
    printed_by_user_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT asset_label_reprints_kind_check CHECK ((kind = ANY (ARRAY['reprint'::text, 'return'::text]))),
    CONSTRAINT asset_label_reprints_reason_check CHECK (((length(btrim(reason)) >= 1) AND (length(btrim(reason)) <= 500)))
);

CREATE TABLE public.asset_return_otps (
    id bigint NOT NULL,
    asset_unit_tag_id bigint,
    issuance_id bigint NOT NULL,
    quantity integer,
    return_condition text,
    requested_by_user_id bigint,
    token_hash text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    override_reason text,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT asset_return_otps_attempts_range CHECK (((attempts >= 0) AND (attempts <= 5))),
    CONSTRAINT asset_return_otps_target_check CHECK (((asset_unit_tag_id IS NOT NULL) OR ((quantity IS NOT NULL) AND (quantity > 0) AND (return_condition IS NOT NULL))))
);

CREATE TABLE public.asset_unit_tags (
    id bigint NOT NULL,
    tag_code text NOT NULL,
    item_id bigint NOT NULL,
    unit_number integer NOT NULL,
    serial_number text,
    location text DEFAULT ''::text NOT NULL,
    condition text NOT NULL,
    lifecycle_status text DEFAULT 'Active'::text NOT NULL,
    custody_status text DEFAULT 'Available'::text NOT NULL,
    issuance_id bigint,
    assigned_employee_id bigint,
    assigned_user_id bigint,
    disposal_reason text DEFAULT ''::text NOT NULL,
    disposal_reference text DEFAULT ''::text NOT NULL,
    last_inspected_at timestamp with time zone,
    last_inspected_by_user_id bigint,
    last_inspection_note text DEFAULT ''::text NOT NULL,
    label_version integer DEFAULT 1 NOT NULL,
    label_printed_at timestamp with time zone,
    label_printed_by_user_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT asset_unit_tags_condition_check CHECK ((condition = ANY (ARRAY['New'::text, 'Good'::text, 'Fair'::text, 'Needs Repair'::text, 'Under Maintenance'::text, 'Unserviceable'::text, 'Retired'::text]))),
    CONSTRAINT asset_unit_tags_custody_status_check CHECK ((custody_status = ANY (ARRAY['Available'::text, 'Issued'::text, 'Borrowed'::text]))),
    CONSTRAINT asset_unit_tags_lifecycle_status_check CHECK ((lifecycle_status = ANY (ARRAY['Active'::text, 'Pending Disposal'::text, 'Disposed'::text]))),
    CONSTRAINT asset_unit_tags_unit_number_positive CHECK ((unit_number > 0))
);

CREATE TABLE public.employee_issuance_batches (
    id bigint NOT NULL,
    employee_id bigint NOT NULL,
    requested_by_user_id bigint,
    requester_user_id bigint,
    status text DEFAULT 'Pending'::text NOT NULL,
    token_hash text NOT NULL,
    token_expires_at timestamp with time zone NOT NULL,
    decision_note text,
    borrow_use_date date,
    expected_return_date date,
    borrow_use_at timestamp with time zone,
    expected_return_at timestamp with time zone,
    use_location text,
    use_purpose text,
    overdue_reminded_at timestamp with time zone,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    email_sent_at timestamp with time zone,
    purchase_requisition_id bigint,
    CONSTRAINT employee_issuance_batches_borrow_details_check CHECK ((((borrow_use_date IS NULL) AND (expected_return_date IS NULL) AND (use_location IS NULL) AND (use_purpose IS NULL)) OR ((borrow_use_date IS NOT NULL) AND (expected_return_date IS NOT NULL) AND (expected_return_date >= borrow_use_date) AND (NULLIF(btrim(use_location), ''::text) IS NOT NULL) AND (NULLIF(btrim(use_purpose), ''::text) IS NOT NULL)))),
    CONSTRAINT employee_issuance_batches_borrow_time_check CHECK ((((borrow_use_at IS NULL) AND (expected_return_at IS NULL)) OR ((borrow_use_at IS NOT NULL) AND (expected_return_at IS NOT NULL) AND (expected_return_at > borrow_use_at)))),
    CONSTRAINT employee_issuance_batches_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Issued'::text, 'Rejected'::text, 'Expired'::text, 'Email Failed'::text])))
);

CREATE TABLE public.employee_issuance_returns (
    id bigint NOT NULL,
    issuance_id bigint NOT NULL,
    asset_unit_tag_id bigint,
    requested_by_user_id bigint,
    status text DEFAULT 'Pending'::text NOT NULL,
    token_hash text NOT NULL,
    token_expires_at timestamp with time zone NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    return_condition text NOT NULL,
    reason text NOT NULL,
    decision_note text,
    returned_by_name text,
    confirmation_method text,
    tag_snapshot jsonb,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    email_sent_at timestamp with time zone,
    repair_outcome text,
    repair_resolved_at timestamp with time zone,
    repair_resolved_by_user_id bigint,
    settlement_status text,
    settlement_note text,
    settled_at timestamp with time zone,
    settled_by_user_id bigint,
    approval_action text,
    approval_note text,
    approval_requested_by_user_id bigint,
    approval_requested_at timestamp with time zone,
    approval_decision_note text,
    voided_at timestamp with time zone,
    voided_by_user_id bigint,
    void_reason text,
    CONSTRAINT employee_issuance_returns_approval_check CHECK ((((approval_action IS NULL) OR (approval_action = ANY (ARRAY['Written Off'::text, 'Paid'::text, 'Replaced'::text]))) AND ((approval_note IS NULL) OR (length(approval_note) <= 1000)) AND ((approval_decision_note IS NULL) OR (length(approval_decision_note) <= 1000)))),
    CONSTRAINT employee_issuance_returns_completion_check CHECK ((((returned_by_name IS NULL) OR (length(returned_by_name) <= 200)) AND ((confirmation_method IS NULL) OR (confirmation_method = ANY (ARRAY['scan'::text, 'typed_code'::text, 'employee_code'::text, 'admin_override'::text]))) AND ((repair_outcome IS NULL) OR (repair_outcome = ANY (ARRAY['Repaired'::text, 'Written Off'::text]))) AND ((settlement_status IS NULL) OR (settlement_status = ANY (ARRAY['Pending'::text, 'Replaced'::text, 'Paid'::text, 'Waived'::text]))) AND ((status <> 'Lost'::text) OR (settlement_status IS NOT NULL)))),
    CONSTRAINT employee_issuance_returns_condition_check CHECK ((return_condition = ANY (ARRAY['New'::text, 'Good'::text, 'Fair'::text, 'Needs Repair'::text, 'Under Maintenance'::text, 'Unserviceable'::text, 'Retired'::text, 'Lost'::text]))),
    CONSTRAINT employee_issuance_returns_quantity_positive_check CHECK ((quantity > 0)),
    CONSTRAINT employee_issuance_returns_reason_check CHECK (((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 1000))),
    CONSTRAINT employee_issuance_returns_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Returned'::text, 'Rejected'::text, 'Expired'::text, 'Email Failed'::text, 'Lost'::text, 'Voided'::text])))
);

CREATE TABLE public.employee_issuances (
    id bigint NOT NULL,
    batch_id bigint,
    employee_id bigint NOT NULL,
    item_id bigint NOT NULL,
    requested_by_user_id bigint,
    status text DEFAULT 'Pending'::text NOT NULL,
    token_hash text,
    token_expires_at timestamp with time zone NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    returned_quantity integer DEFAULT 0 NOT NULL,
    unit_of_measure text DEFAULT 'piece'::text NOT NULL,
    item_condition text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    decision_note text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    email_sent_at timestamp with time zone,
    purchase_requisition_line_id bigint,
    recipient_location text DEFAULT ''::text NOT NULL,
    recipient_purpose text DEFAULT ''::text NOT NULL,
    CONSTRAINT employee_issuances_notes_check CHECK ((length(TRIM(BOTH FROM notes)) <= 1000)),
    CONSTRAINT employee_issuances_quantity_positive_check CHECK ((quantity > 0)),
    CONSTRAINT employee_issuances_recipient_location_length_check CHECK ((length(TRIM(BOTH FROM recipient_location)) <= 200)),
    CONSTRAINT employee_issuances_recipient_purpose_length_check CHECK ((length(TRIM(BOTH FROM recipient_purpose)) <= 500)),
    CONSTRAINT employee_issuances_returned_quantity_check CHECK (((returned_quantity >= 0) AND (returned_quantity <= quantity))),
    CONSTRAINT employee_issuances_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Issued'::text, 'Rejected'::text, 'Expired'::text, 'Email Failed'::text, 'Returned'::text])))
);

ALTER TABLE public.asset_label_reprints ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.asset_label_reprints_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.asset_return_otps ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.asset_return_otps_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.asset_unit_tags ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.asset_unit_tags_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.employee_issuance_batches ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.employee_issuance_batches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.employee_issuance_returns ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.employee_issuance_returns_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.employee_issuances ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.employee_issuances_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.asset_label_reprints
    ADD CONSTRAINT asset_label_reprints_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.asset_return_otps
    ADD CONSTRAINT asset_return_otps_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.asset_unit_tags
    ADD CONSTRAINT asset_unit_tags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.asset_unit_tags
    ADD CONSTRAINT asset_unit_tags_tag_code_key UNIQUE (tag_code);

ALTER TABLE ONLY public.employee_issuance_batches
    ADD CONSTRAINT employee_issuance_batches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.employee_issuance_batches
    ADD CONSTRAINT employee_issuance_batches_token_hash_key UNIQUE (token_hash);

ALTER TABLE ONLY public.employee_issuance_returns
    ADD CONSTRAINT employee_issuance_returns_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.employee_issuance_returns
    ADD CONSTRAINT employee_issuance_returns_token_hash_key UNIQUE (token_hash);

ALTER TABLE ONLY public.employee_issuances
    ADD CONSTRAINT employee_issuances_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.employee_issuances
    ADD CONSTRAINT employee_issuances_token_hash_key UNIQUE (token_hash);

CREATE UNIQUE INDEX asset_label_reprints_old_code_idx ON public.asset_label_reprints USING btree (old_tag_code);

CREATE INDEX asset_label_reprints_tag_idx ON public.asset_label_reprints USING btree (asset_unit_tag_id, created_at DESC, id DESC);

CREATE INDEX asset_return_otps_open_bulk_idx ON public.asset_return_otps USING btree (issuance_id) WHERE ((used_at IS NULL) AND (asset_unit_tag_id IS NULL));

CREATE INDEX asset_return_otps_open_tag_idx ON public.asset_return_otps USING btree (asset_unit_tag_id) WHERE (used_at IS NULL);

CREATE INDEX asset_unit_tags_employee_custody_idx ON public.asset_unit_tags USING btree (assigned_employee_id, custody_status, lifecycle_status);

CREATE INDEX asset_unit_tags_issuance_idx ON public.asset_unit_tags USING btree (issuance_id, unit_number) WHERE (issuance_id IS NOT NULL);

CREATE UNIQUE INDEX asset_unit_tags_item_unit_unique_idx ON public.asset_unit_tags USING btree (item_id, unit_number);

CREATE UNIQUE INDEX asset_unit_tags_serial_number_lower_unique_idx ON public.asset_unit_tags USING btree (lower(serial_number)) WHERE ((serial_number IS NOT NULL) AND (length(TRIM(BOTH FROM serial_number)) > 0));

CREATE INDEX employee_issuance_batches_employee_requested_idx ON public.employee_issuance_batches USING btree (employee_id, requested_at DESC, id DESC);

CREATE INDEX employee_issuance_batches_pending_expiry_idx ON public.employee_issuance_batches USING btree (token_expires_at, id) WHERE (status = 'Pending'::text);

CREATE INDEX employee_issuance_batches_requester_status_idx ON public.employee_issuance_batches USING btree (requester_user_id, status, requested_at DESC) WHERE (requester_user_id IS NOT NULL);

CREATE INDEX employee_issuance_returns_approval_idx ON public.employee_issuance_returns USING btree (approval_requested_at) WHERE (approval_action IS NOT NULL);

CREATE INDEX employee_issuance_returns_asset_unit_tag_idx ON public.employee_issuance_returns USING btree (asset_unit_tag_id, decided_at DESC) WHERE (asset_unit_tag_id IS NOT NULL);

CREATE INDEX employee_issuance_returns_issuance_requested_idx ON public.employee_issuance_returns USING btree (issuance_id, requested_at DESC, id DESC);

CREATE UNIQUE INDEX employee_issuance_returns_one_pending_idx ON public.employee_issuance_returns USING btree (issuance_id) WHERE (status = 'Pending'::text);

CREATE INDEX employee_issuance_returns_open_settlement_idx ON public.employee_issuance_returns USING btree (issuance_id) WHERE ((status = 'Lost'::text) AND (settlement_status = 'Pending'::text));

CREATE INDEX employee_issuances_batch_idx ON public.employee_issuances USING btree (batch_id, id) WHERE (batch_id IS NOT NULL);

CREATE INDEX employee_issuances_employee_requested_idx ON public.employee_issuances USING btree (employee_id, requested_at DESC, id DESC);

CREATE INDEX employee_issuances_item_status_idx ON public.employee_issuances USING btree (item_id, status);

CREATE INDEX employee_issuances_purchase_line_idx ON public.employee_issuances USING btree (purchase_requisition_line_id) WHERE (purchase_requisition_line_id IS NOT NULL);

CREATE INDEX employee_issuances_recipient_context_idx ON public.employee_issuances USING btree (employee_id, requested_at DESC, id DESC) WHERE ((recipient_location <> ''::text) OR (recipient_purpose <> ''::text));

ALTER TABLE ONLY public.asset_label_reprints
    ADD CONSTRAINT asset_label_reprints_asset_unit_tag_id_fkey FOREIGN KEY (asset_unit_tag_id) REFERENCES public.asset_unit_tags(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.asset_label_reprints
    ADD CONSTRAINT asset_label_reprints_printed_by_user_id_fkey FOREIGN KEY (printed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.asset_return_otps
    ADD CONSTRAINT asset_return_otps_asset_unit_tag_id_fkey FOREIGN KEY (asset_unit_tag_id) REFERENCES public.asset_unit_tags(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.asset_return_otps
    ADD CONSTRAINT asset_return_otps_issuance_id_fkey FOREIGN KEY (issuance_id) REFERENCES public.employee_issuances(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.asset_return_otps
    ADD CONSTRAINT asset_return_otps_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.asset_unit_tags
    ADD CONSTRAINT asset_unit_tags_assigned_employee_id_fkey FOREIGN KEY (assigned_employee_id) REFERENCES public.employees(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.asset_unit_tags
    ADD CONSTRAINT asset_unit_tags_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.asset_unit_tags
    ADD CONSTRAINT asset_unit_tags_issuance_id_fkey FOREIGN KEY (issuance_id) REFERENCES public.employee_issuances(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.asset_unit_tags
    ADD CONSTRAINT asset_unit_tags_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.item_catalog(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.asset_unit_tags
    ADD CONSTRAINT asset_unit_tags_label_printed_by_user_id_fkey FOREIGN KEY (label_printed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.asset_unit_tags
    ADD CONSTRAINT asset_unit_tags_last_inspected_by_user_id_fkey FOREIGN KEY (last_inspected_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.employee_issuance_batches
    ADD CONSTRAINT employee_issuance_batches_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_issuance_batches
    ADD CONSTRAINT employee_issuance_batches_purchase_requisition_id_fkey FOREIGN KEY (purchase_requisition_id) REFERENCES public.service_requests(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_issuance_batches
    ADD CONSTRAINT employee_issuance_batches_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.employee_issuance_batches
    ADD CONSTRAINT employee_issuance_batches_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_issuance_returns
    ADD CONSTRAINT employee_issuance_returns_approval_requested_by_user_id_fkey FOREIGN KEY (approval_requested_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.employee_issuance_returns
    ADD CONSTRAINT employee_issuance_returns_asset_unit_tag_id_fkey FOREIGN KEY (asset_unit_tag_id) REFERENCES public.asset_unit_tags(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_issuance_returns
    ADD CONSTRAINT employee_issuance_returns_issuance_id_fkey FOREIGN KEY (issuance_id) REFERENCES public.employee_issuances(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_issuance_returns
    ADD CONSTRAINT employee_issuance_returns_repair_resolved_by_user_id_fkey FOREIGN KEY (repair_resolved_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.employee_issuance_returns
    ADD CONSTRAINT employee_issuance_returns_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.employee_issuance_returns
    ADD CONSTRAINT employee_issuance_returns_settled_by_user_id_fkey FOREIGN KEY (settled_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.employee_issuance_returns
    ADD CONSTRAINT employee_issuance_returns_voided_by_user_id_fkey FOREIGN KEY (voided_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.employee_issuances
    ADD CONSTRAINT employee_issuances_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.employee_issuance_batches(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_issuances
    ADD CONSTRAINT employee_issuances_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_issuances
    ADD CONSTRAINT employee_issuances_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.item_catalog(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_issuances
    ADD CONSTRAINT employee_issuances_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

COMMIT;
