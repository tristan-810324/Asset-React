# DYCI GSO / A.SSET — Full Stack Installation Guide

This guide is for a local Windows development setup. It covers the React frontend and the Express/PostgreSQL backend, including inventory, employee issuance, and return approval. Keep credentials in `backend/.env`; never paste them into source files or commit them.

## 1. Prerequisites

- Node.js 22 LTS and npm.
- PostgreSQL 16 or newer, or a PostgreSQL-compatible local service.
- VS Code with PowerShell terminals.
- The project already contains `frontend/` and `backend/` folders.

Check Node and npm versions from the project root:

```powershell
node --version
npm --version
```

## 2. Install dependencies

Open a terminal at the project root, then install each application's dependencies:

```powershell
Set-Location backend
npm install
Set-Location ..\frontend
npm install
Set-Location ..
```

The backend dependencies are declared in `backend/package.json`; do not install a second copy of the project under another folder.

## 3. Create the development database

Create a database named `dyci_gso` in pgAdmin (right-click **Databases** → **Create** → **Database**) or from `psql`:

```powershell
psql -U postgres -d postgres -c "CREATE DATABASE dyci_gso;"
```

Run the database migrations in order, then apply the reference seed, from the project root:

```powershell
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\migrations\001_initial_schema.sql
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\migrations\002_email_verification_otp.sql
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\migrations\003_inventory_items.sql
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\migrations\004_inventory_categories_and_change_history.sql
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\migrations\005_inventory_created_audit_action.sql
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\migrations\006_employees_and_audit_logs.sql
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\migrations\007_employee_issuance_returns.sql
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\seeds\001_initial_seed.sql
```

If PowerShell cannot find `psql`, use pgAdmin's Query Tool and run each SQL file against `dyci_gso`, or add your PostgreSQL `bin` folder to PATH. On Windows, `psql.exe` is commonly under `C:\Program Files\PostgreSQL\<version>\bin\`.

The migrations create the authentication foundation, inventory catalog and audit logs, employee profiles and issuance records, and employee-confirmed item returns. Migration `007_employee_issuance_returns.sql` is required for the GSO return-approval email flow.

## 4. Configure `backend/.env`

`backend/.env` already exists in this workspace. Keep its current secret values private and edit the file locally in VS Code. Do not replace it with `.env.example` or commit it.

Make sure it contains these keys, using your own local PostgreSQL credentials and a new random JWT secret:

```dotenv
NODE_ENV=development
PORT=5000
FRONTEND_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://postgres:YOUR_URL_ENCODED_PASSWORD@localhost:5432/dyci_gso
JWT_SECRET=PUT_A_PRIVATE_RANDOM_VALUE_OF_AT_LEAST_32_CHARACTERS_HERE
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

- URL-encode special characters in the database password in `DATABASE_URL` (for example, `@` becomes `%40`).
- `JWT_SECRET` must be at least 32 characters. Generate a local value in PowerShell with:

  ```powershell
  $secretBytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($secretBytes)
  [Convert]::ToBase64String($secretBytes)
  ```

- First-login email verification and password-reset email require all four SMTP connection values (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`); `SMTP_FROM` is optional and defaults to `SMTP_USER`.
- Existing verified accounts can sign in without SMTP. New GSO staff accounts cannot complete their first sign-in until SMTP is configured. If SMTP is missing, email verification and `/forgot-password` return a service-unavailable response.
- Keep the existing `.env` file and only update values you have verified. Do not send SMTP or database credentials in chat.

`backend/.env.example` contains placeholders only and is safe to share. It is a reference for required variable names, not a working credential file.

## 5. Create the first IT Admin account

After the database schema and seed have been applied, open an interactive terminal:

```powershell
Set-Location backend
node .\scripts\create-admin.js
```

Enter the account name and email. The initial password is masked while typing and must contain 12–72 UTF-8 bytes. The script hashes it before saving, assigns the `IT_ADMIN` role, and does not expose an admin-creation API to the public. Keep the password private; use the forgot-password flow after SMTP is configured if you need to change it.

For the requested local IT Admin identity, enter `admin@dyci.edu.ph` and choose a private password that has not been shared. Sign in as the IT Admin and create new GSO staff accounts from Admin → User Management. New accounts use the initial password `Admin123`; on first sign-in with the account email and that password, the app sends a one-time OTP using Nodemailer. After successful verification, later sign-ins go directly to the GSO dashboard. The existing seeded `gso@dyci.edu.ph` account remains unchanged and pre-verified.

## 6. Start the backend and frontend

Use two VS Code terminals.

**Terminal 1 — backend:**

```powershell
Set-Location backend
npm run dev
```

The server listens on `http://localhost:5000`. Check the database connection at `http://localhost:5000/api/v1/health`.

**Terminal 2 — frontend:**

```powershell
Set-Location frontend
npm run dev
```

Vite normally serves the frontend at `http://localhost:5173`, which must match `FRONTEND_ORIGIN` in `backend/.env`.

## 7. Auth API implemented in this phase

All endpoints use the `/api/v1/auth` prefix:

| Method and path | Body / purpose |
|---|---|
| `POST /login` | `{ "email": "...", "password": "..." }`; returns an email-verification challenge for a new unverified account, or a one-hour JWT and user/role details |
| `POST /verify-email-otp` | `{ "challengeId": "...", "otp": "123456" }`; verifies a new GSO account's email on first sign-in and returns a JWT |
| `POST /forgot-password` | `{ "email": "..." }`; sends a six-digit OTP when the account exists and SMTP is ready |
| `POST /verify-otp` | `{ "challengeId": "...", "otp": "123456" }`; returns a short-lived reset token |
| `POST /reset-password` | `{ "resetToken": "...", "password": "..." }`; consumes the token and invalidates existing JWT sessions |
| `GET /me` | Requires `Authorization: Bearer <JWT>`; returns the current account and roles |

First-login verification and password-reset OTP codes expire after five minutes, allow at most five attempts, and are stored as keyed verifiers. Verification is required once per new GSO account; successful verification marks the email verified. Password reset tokens expire after ten minutes and can only be consumed once. Login errors use a generic response, with database-backed request throttling and security event records.

Public registration is intentionally not implemented: the project requirements say IT Admin creates GSO staff accounts. The existing registration page remains untouched.

## 8. Current frontend connection status

The login form calls `POST /api/v1/auth/login`. When an unverified GSO account enters the correct email and initial password, it routes to `/verify-email` after the backend sends an OTP. Successful verification returns a JWT and routes to `/gso`; verified GSO and IT Admin accounts go directly to their dashboard. Protected dashboards confirm the signed-in role through `GET /api/v1/auth/me`. Admin User Management calls the protected `/api/v1/users` endpoints. Public registration remains unavailable, and the existing registration file is preserved.

## 9. Troubleshooting

- **Backend reports a database connection failure:** confirm PostgreSQL is running, the database exists, and `DATABASE_URL` uses the correct host, port, database name, username, and URL-encoded password.
- **Backend rejects configuration:** confirm `PORT`, `DATABASE_URL`, and a 32-character `JWT_SECRET`; leave all four SMTP connection values empty or configure all four.
- **Database reports a missing table, role, or rejected OTP purpose:** apply `001_initial_schema.sql`, then `002_email_verification_otp.sql`, then `001_initial_seed.sql`.
- **Browser reports a CORS error:** set `FRONTEND_ORIGIN` to the exact Vite origin shown in its terminal, then restart the backend.
- **First-login OTP or forgot-password cannot send mail:** verify the SMTP host, port, login, and provider-specific app password; restart the backend after editing `.env`. Check the recipient's spam folder as well.
- **Admin creation says the email already exists:** use the existing account; do not run account creation again with that address.

## 10. Before sharing or deploying

- Never commit `backend/.env`, SMTP credentials, database passwords, JWT secrets, or temporary passwords.
- Use separate production credentials, HTTPS, a restricted database user, and a production SMTP provider.
- The auth schema is the first phase only; complete the remaining GSO schema and permission rules before enabling other modules.
