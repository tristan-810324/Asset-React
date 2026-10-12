# DYCI GSO / A.SSET — Full Stack Installation Guide

This guide is for a local Windows development setup. It covers the existing React frontend and the Express/PostgreSQL authentication backend. Keep credentials in `backend/.env`; never paste them into source files or commit them.

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

Run the authentication schema, then its repeat-safe reference seed, from the project root:

```powershell
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\migrations\001_initial_schema.sql
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\seeds\001_initial_seed.sql
```

If PowerShell cannot find `psql`, use pgAdmin's Query Tool and run each SQL file against `dyci_gso`, or add your PostgreSQL `bin` folder to PATH. On Windows, `psql.exe` is commonly under `C:\Program Files\PostgreSQL\<version>\bin\`.

The current migration creates the auth foundation (`users`, roles, permissions, OTP/reset tokens, login events, and hashed rate-limit buckets). It does not yet create the inventory, requests, borrowing, or reporting tables; those belong to later backend phases after their workflows and ERD are finalized.

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

- Login works without SMTP settings. Password-reset email requires all four SMTP connection values (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`); `SMTP_FROM` is optional and defaults to `SMTP_USER`.
- If SMTP is not configured, `/forgot-password` returns a service-unavailable response without checking whether an account exists.
- Keep the existing `.env` file and only update values you have verified. Do not send SMTP or database credentials in chat.

`backend/.env.example` contains placeholders only and is safe to share. It is a reference for required variable names, not a working credential file.

## 5. Create the first IT Admin account

After the database schema and seed have been applied, open an interactive terminal:

```powershell
Set-Location backend
node .\scripts\create-admin.js
```

Enter the account name and email. The initial password is masked while typing and must contain 12–72 UTF-8 bytes. The script hashes it before saving, assigns the `IT_ADMIN` role, and does not expose an admin-creation API to the public. Keep the password private; use the forgot-password flow after SMTP is configured if you need to change it.

For the requested local IT Admin identity, enter `admin@dyci.edu.ph` and choose a private password that has not been shared. The current script creates only an IT Admin account; a GSO Staff account (`gso@dyci.edu.ph`) must be provisioned through a future secure IT Admin account-management/bootstrap flow. The seed does not create user accounts or set default passwords.

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
| `POST /login` | `{ "email": "...", "password": "..." }`; returns a one-hour JWT and user/role details |
| `POST /forgot-password` | `{ "email": "..." }`; sends a six-digit OTP when the account exists and SMTP is ready |
| `POST /verify-otp` | `{ "challengeId": "...", "otp": "123456" }`; returns a short-lived reset token |
| `POST /reset-password` | `{ "resetToken": "...", "password": "..." }`; consumes the token and invalidates existing JWT sessions |
| `GET /me` | Requires `Authorization: Bearer <JWT>`; returns the current account and roles |

OTP codes expire after five minutes, allow at most five attempts, and are stored as keyed verifiers. Password reset tokens expire after ten minutes and can only be consumed once. Login errors use a generic response, with database-backed request throttling and security event records.

Public registration is intentionally not implemented: the project requirements say IT Admin creates GSO staff accounts. The existing registration page remains untouched.

## 8. Current frontend connection status

The login form now calls `POST /api/v1/auth/login`, keeps the JWT for the current browser tab, and routes IT Admin users to `/admin` and GSO Staff users to `/gso`. Those routes verify the signed-in role through `GET /api/v1/auth/me`. The IT Admin page is currently a minimal landing screen; account management, activity, and system-monitoring data are not implemented yet. Forgot-password, OTP, and reset-password screens still need their API form handlers. Public registration remains unavailable by project policy, and the existing registration file is preserved.

## 9. Troubleshooting

- **Backend reports a database connection failure:** confirm PostgreSQL is running, the database exists, and `DATABASE_URL` uses the correct host, port, database name, username, and URL-encoded password.
- **Backend rejects configuration:** confirm `PORT`, `DATABASE_URL`, and a 32-character `JWT_SECRET`; leave all four SMTP connection values empty or configure all four.
- **Database reports a missing table or role:** apply `001_initial_schema.sql` first, then `001_initial_seed.sql`.
- **Browser reports a CORS error:** set `FRONTEND_ORIGIN` to the exact Vite origin shown in its terminal, then restart the backend.
- **Forgot-password cannot send mail:** verify the SMTP host, port, login, and provider-specific app password; restart the backend after editing `.env`.
- **Admin creation says the email already exists:** use the existing account; do not run account creation again with that address.

## 10. Before sharing or deploying

- Never commit `backend/.env`, SMTP credentials, database passwords, JWT secrets, or temporary passwords.
- Use separate production credentials, HTTPS, a restricted database user, and a production SMTP provider.
- The auth schema is the first phase only; complete the remaining GSO schema and permission rules before enabling other modules.
