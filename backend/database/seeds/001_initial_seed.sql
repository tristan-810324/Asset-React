INSERT INTO roles (role_key, display_name)
VALUES
    ('IT_ADMIN', 'IT Admin'),
    ('IT_STAFF', 'IT Staff'),
    ('GSO_STAFF', 'GSO Staff'),
    ('GSO_HEAD', 'GSO Head'),
    ('BORROWER', 'Requester')
ON CONFLICT (role_key) DO NOTHING;

INSERT INTO permissions (permission_key, description)
VALUES
    ('auth.login', 'Sign in to the staff portal'),
    ('users.manage', 'Create and manage staff accounts')
ON CONFLICT (permission_key) DO NOTHING; 

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
 CROSS JOIN permissions p
 WHERE (r.role_key = 'IT_ADMIN' AND p.permission_key IN ('auth.login', 'users.manage'))
    OR (r.role_key IN ('IT_STAFF', 'GSO_STAFF', 'GSO_HEAD', 'BORROWER') AND p.permission_key = 'auth.login')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Local development accounts for the requested direct-to-dashboard login flow.
-- Default password for all seed accounts is Admin123 (stored as a bcrypt hash).
-- Email is pre-verified so no activation OTP is needed.
-- Reuse the former seeded IT Staff identity for GSO Head so its existing history stays intact.
-- If a GSO Head seed already exists, retire the old IT Staff demo identity instead of deleting history.
DO $$
DECLARE
    legacy_user_id BIGINT;
BEGIN
    SELECT id INTO legacy_user_id
      FROM users
     WHERE lower(email) = 'itstaff@dyci.edu.ph';

    IF legacy_user_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM users WHERE lower(email) = 'gsohead@dyci.edu.ph') THEN
            UPDATE users
               SET name = 'Retired DYCI IT Staff Seed',
                   email = 'retired-itstaff-seed-' || legacy_user_id || '@dyci.edu.ph',
                   position = '',
                   is_active = FALSE,
                   token_version = token_version + 1,
                   updated_at = NOW()
             WHERE id = legacy_user_id;
        ELSE
            UPDATE users
               SET name = 'DYCI GSO Head',
                   email = 'gsohead@dyci.edu.ph',
                   position = 'GSO Head',
                   password_hash = '$2b$12$KJ17o6wIXzjT5c8aQzBQaeJcgiBMzeu8DwM6tDlH4AJzghgsrZqC.',
                   is_active = TRUE,
                   email_verified_at = COALESCE(email_verified_at, NOW()),
                   updated_at = NOW()
             WHERE id = legacy_user_id;
        END IF;
    END IF;
END $$;

INSERT INTO users (name, email, position, password_hash, email_verified_at)
VALUES
    ('DYCI IT Admin', 'admin@dyci.edu.ph', '', '$2b$12$KJ17o6wIXzjT5c8aQzBQaeJcgiBMzeu8DwM6tDlH4AJzghgsrZqC.', NOW()),
    ('DYCI GSO Head', 'gsohead@dyci.edu.ph', 'GSO Head', '$2b$12$KJ17o6wIXzjT5c8aQzBQaeJcgiBMzeu8DwM6tDlH4AJzghgsrZqC.', NOW()),
    ('DYCI GSO Staff', 'gso@dyci.edu.ph', '', '$2b$12$KJ17o6wIXzjT5c8aQzBQaeJcgiBMzeu8DwM6tDlH4AJzghgsrZqC.', NOW()),
    ('DYCI Requester', 'borrow@dyci.edu.ph', '', '$2b$12$KJ17o6wIXzjT5c8aQzBQaeJcgiBMzeu8DwM6tDlH4AJzghgsrZqC.', NOW())
ON CONFLICT DO NOTHING;

-- Refresh the seeded credentials on reruns so existing local accounts also use Admin123.
UPDATE users
   SET password_hash = '$2b$12$KJ17o6wIXzjT5c8aQzBQaeJcgiBMzeu8DwM6tDlH4AJzghgsrZqC.',
       position = CASE WHEN lower(email) = 'gsohead@dyci.edu.ph' THEN 'GSO Head' ELSE position END,
       is_active = TRUE,
       email_verified_at = COALESCE(email_verified_at, NOW()),
       updated_at = NOW()
 WHERE lower(email) IN ('admin@dyci.edu.ph', 'gsohead@dyci.edu.ph', 'gso@dyci.edu.ph', 'borrow@dyci.edu.ph');

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
  FROM (VALUES
      ('admin@dyci.edu.ph', 'IT_ADMIN'),
      ('gsohead@dyci.edu.ph', 'GSO_HEAD'),
      ('gso@dyci.edu.ph', 'GSO_STAFF'),
      ('borrow@dyci.edu.ph', 'BORROWER')
  ) AS seeded_accounts(email, role_key)
  JOIN users u ON lower(u.email) = seeded_accounts.email
  JOIN roles r ON r.role_key = seeded_accounts.role_key
ON CONFLICT (user_id, role_id) DO NOTHING;

-- The seeded GSO Head account has only its intended role. Retired legacy demo identities keep
-- their rows for historical references, but can no longer sign in or retain a demo role.
DELETE FROM user_roles ur
 USING users u, roles r
 WHERE ur.user_id = u.id
   AND ur.role_id = r.id
   AND lower(u.email) = 'gsohead@dyci.edu.ph'
   AND r.role_key <> 'GSO_HEAD';

DELETE FROM user_roles ur
 USING users u
 WHERE ur.user_id = u.id
   AND lower(u.email) LIKE 'retired-itstaff-seed-%';

-- Keep the seeded requester account separate from staff/admin roles on reruns.
DELETE FROM user_roles ur
 USING users u
 WHERE ur.user_id = u.id
   AND lower(u.email) = 'borrow@dyci.edu.ph'
   AND ur.role_id <> (SELECT id FROM roles WHERE role_key = 'BORROWER');
