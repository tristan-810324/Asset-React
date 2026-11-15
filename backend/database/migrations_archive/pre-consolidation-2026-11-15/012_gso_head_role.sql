-- Give the GSO Head a distinct sign-in role for user management and future approval routing.
BEGIN;

INSERT INTO roles (role_key, display_name)
VALUES ('GSO_HEAD', 'GSO Head')
ON CONFLICT (role_key) DO UPDATE
   SET display_name = EXCLUDED.display_name;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles AS r
  JOIN permissions AS p ON p.permission_key = 'auth.login'
 WHERE r.role_key = 'GSO_HEAD'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
