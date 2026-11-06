BEGIN;

ALTER TABLE employee_issuance_batches
    ADD COLUMN IF NOT EXISTS borrow_use_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS expected_return_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'employee_issuance_batches_borrow_time_check'
           AND conrelid = 'employee_issuance_batches'::regclass
    ) THEN
        ALTER TABLE employee_issuance_batches
            ADD CONSTRAINT employee_issuance_batches_borrow_time_check
            CHECK (
                (borrow_use_at IS NULL AND expected_return_at IS NULL)
                OR (
                    borrow_use_at IS NOT NULL
                    AND expected_return_at IS NOT NULL
                    AND expected_return_at > borrow_use_at
                )
            );
    END IF;
END $$;

COMMIT;
