BEGIN;

ALTER TABLE employee_issuances
    ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

ALTER TABLE employee_issuances
    ADD COLUMN IF NOT EXISTS unit_of_measure TEXT NOT NULL DEFAULT 'piece';

UPDATE employee_issuances AS issue
   SET unit_of_measure = inventory.unit_of_measure
  FROM item_catalog AS inventory
 WHERE inventory.id = issue.item_id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'employee_issuances_quantity_positive_check'
           AND conrelid = 'employee_issuances'::regclass
    ) THEN
        ALTER TABLE employee_issuances
            ADD CONSTRAINT employee_issuances_quantity_positive_check CHECK (quantity > 0);
    END IF;
END $$;

DROP INDEX IF EXISTS employee_issuances_one_active_item_idx;

COMMIT;
