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
-- Passwords are stored as bcrypt hashes; email is pre-verified so no activation OTP is needed.
INSERT INTO users (name, email, password_hash, email_verified_at)
VALUES
    ('DYCI IT Admin', 'admin@dyci.edu.ph', '$2b$12$B9Xn6SVhM53HDqjmuS2ipeFxx2GXiWjZ85wQ8Rs4fVrweT2BjsgBa', NOW()),
    ('DYCI GSO Staff', 'gso@dyci.edu.ph', '$2b$12$B9Xn6SVhM53HDqjmuS2ipeFxx2GXiWjZ85wQ8Rs4fVrweT2BjsgBa', NOW())
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
  FROM (VALUES
      ('admin@dyci.edu.ph', 'IT_ADMIN'),
      ('gso@dyci.edu.ph', 'GSO_STAFF')
  ) AS seeded_accounts(email, role_key)
  JOIN users u ON lower(u.email) = seeded_accounts.email
  JOIN roles r ON r.role_key = seeded_accounts.role_key
ON CONFLICT (user_id, role_id) DO NOTHING;
