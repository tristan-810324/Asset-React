BEGIN;

INSERT INTO roles (role_key, display_name)
VALUES ('IT_STAFF', 'IT Staff')
ON CONFLICT (role_key) DO NOTHING;

UPDATE roles
   SET display_name = 'Requester'
 WHERE role_key = 'BORROWER';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
 CROSS JOIN permissions p
 WHERE r.role_key = 'IT_STAFF'
   AND p.permission_key = 'auth.login'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
