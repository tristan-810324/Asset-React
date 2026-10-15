INSERT INTO roles (role_key, display_name)
VALUES
    ('IT_ADMIN', 'IT Admin'),
    ('GSO_STAFF', 'GSO Staff')
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
    OR (r.role_key = 'GSO_STAFF' AND p.permission_key = 'auth.login')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Local development accounts for the requested direct-to-dashboard login flow.
-- Default password for both seed accounts is Admin123 (stored as a bcrypt hash).
-- Email is pre-verified so no activation OTP is needed.
INSERT INTO users (name, email, password_hash, email_verified_at)
VALUES
    ('DYCI IT Admin', 'admin@dyci.edu.ph', '$2b$12$KJ17o6wIXzjT5c8aQzBQaeJcgiBMzeu8DwM6tDlH4AJzghgsrZqC.', NOW()),
    ('DYCI GSO Staff', 'gso@dyci.edu.ph', '$2b$12$KJ17o6wIXzjT5c8aQzBQaeJcgiBMzeu8DwM6tDlH4AJzghgsrZqC.', NOW())
ON CONFLICT DO NOTHING;

-- Refresh the seeded credentials on reruns so existing local accounts also use Admin123.
UPDATE users
   SET password_hash = '$2b$12$KJ17o6wIXzjT5c8aQzBQaeJcgiBMzeu8DwM6tDlH4AJzghgsrZqC.',
       is_active = TRUE,
       email_verified_at = COALESCE(email_verified_at, NOW()),
       updated_at = NOW()
 WHERE lower(email) IN ('admin@dyci.edu.ph', 'gso@dyci.edu.ph');

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
  FROM (VALUES
      ('admin@dyci.edu.ph', 'IT_ADMIN'),
      ('gso@dyci.edu.ph', 'GSO_STAFF')
  ) AS seeded_accounts(email, role_key)
  JOIN users u ON lower(u.email) = seeded_accounts.email
  JOIN roles r ON r.role_key = seeded_accounts.role_key
ON CONFLICT (user_id, role_id) DO NOTHING;
