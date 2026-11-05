BEGIN;

ALTER TABLE employee_issuance_batches
    ADD COLUMN IF NOT EXISTS borrow_use_date DATE,
    ADD COLUMN IF NOT EXISTS expected_return_date DATE,
    ADD COLUMN IF NOT EXISTS use_location TEXT,
    ADD COLUMN IF NOT EXISTS use_purpose TEXT;

ALTER TABLE employee_issuance_batches
    ADD CONSTRAINT employee_issuance_batches_borrow_details_check
    CHECK (
        (borrow_use_date IS NULL AND expected_return_date IS NULL AND use_location IS NULL AND use_purpose IS NULL)
        OR (
            borrow_use_date IS NOT NULL
            AND expected_return_date IS NOT NULL
            AND expected_return_date >= borrow_use_date
            AND NULLIF(BTRIM(use_location), '') IS NOT NULL
            AND NULLIF(BTRIM(use_purpose), '') IS NOT NULL
        )
    );

COMMIT;
