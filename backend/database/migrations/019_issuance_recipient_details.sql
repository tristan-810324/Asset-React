-- Preserve the intended employee and use context recorded during Main Issuance.
-- The requesting head remains the batch handover recipient; each issuance line and
-- barcode stays assigned to the actual employee who will use the item.
BEGIN;

ALTER TABLE employee_issuances
    ADD COLUMN recipient_location TEXT NOT NULL DEFAULT '',
    ADD COLUMN recipient_purpose TEXT NOT NULL DEFAULT '';

ALTER TABLE employee_issuances
    ADD CONSTRAINT employee_issuances_recipient_location_length_check
        CHECK (length(trim(recipient_location)) <= 200),
    ADD CONSTRAINT employee_issuances_recipient_purpose_length_check
        CHECK (length(trim(recipient_purpose)) <= 500);

CREATE INDEX employee_issuances_recipient_context_idx
    ON employee_issuances (employee_id, requested_at DESC, id DESC)
    WHERE recipient_location <> '' OR recipient_purpose <> '';

COMMIT;
