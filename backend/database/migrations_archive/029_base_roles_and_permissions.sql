BEGIN;

-- Reference rows the application cannot run without: create-admin.js needs IT_ADMIN and
-- requester registration needs BORROWER. Before this file they existed only in
-- seeds/001_initial_seed.sql, which also creates demo accounts with a known password.
INSERT INTO roles (role_key, display_name)
VALUES
    ('IT_ADMIN', 'IT Admin'),
    ('IT_STAFF', 'IT Staff'),
    ('GSO_STAFF', 'GSO Staff'),
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
    OR (r.role_key IN ('IT_STAFF', 'GSO_STAFF', 'BORROWER') AND p.permission_key = 'auth.login')
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
