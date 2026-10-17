BEGIN;

ALTER TABLE employee_issuances
    ADD COLUMN IF NOT EXISTS returned_quantity INTEGER NOT NULL DEFAULT 0;

ALTER TABLE employee_issuance_returns
    ADD COLUMN IF NOT EXISTS quantity INTEGER;

UPDATE employee_issuances
   SET returned_quantity = quantity
 WHERE status = 'Returned'
   AND returned_quantity = 0;

UPDATE employee_issuance_returns AS return_request
   SET quantity = issue.quantity
  FROM employee_issuances AS issue
 WHERE issue.id = return_request.issuance_id
   AND return_request.quantity IS NULL;

ALTER TABLE employee_issuance_returns
    ALTER COLUMN quantity SET DEFAULT 1,
    ALTER COLUMN quantity SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'employee_issuances_returned_quantity_check'
           AND conrelid = 'employee_issuances'::regclass
    ) THEN
        ALTER TABLE employee_issuances
            ADD CONSTRAINT employee_issuances_returned_quantity_check
            CHECK (returned_quantity >= 0 AND returned_quantity <= quantity);
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'employee_issuance_returns_quantity_positive_check'
           AND conrelid = 'employee_issuance_returns'::regclass
    ) THEN
        ALTER TABLE employee_issuance_returns
            ADD CONSTRAINT employee_issuance_returns_quantity_positive_check
            CHECK (quantity > 0);
    END IF;
END $$;

COMMIT;
