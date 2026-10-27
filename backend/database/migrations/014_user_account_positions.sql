BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS position TEXT NOT NULL DEFAULT '';

-- Fill positions for existing user accounts that already match an employee profile.
UPDATE users AS user_account
   SET position = employee.position
  FROM employees AS employee
 WHERE lower(employee.email) = lower(user_account.email)
   AND length(trim(user_account.position)) = 0;

COMMIT;
