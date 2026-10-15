# A.SSET Deployment Guide

Ang dokumentong ito ang step-by-step guide para i-deploy ang project gamit ang libreng setup:

```text
Vercel (frontend) + Render (backend) + Neon (PostgreSQL) + Gmail SMTP (OTP email)
```

> **Scope:** Documentation only. Walang kailangang baguhin sa application code para sa deployment steps na ito.

## 1. Project tech stack

### Frontend

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- React DOM
- ESLint
- Custom path-based routing gamit ang `window.location.pathname`

Location: `frontend/`

### Backend

- Node.js
- Express 5
- CommonJS modules
- `pg` para sa PostgreSQL connection
- `jsonwebtoken` para sa JWT authentication
- `bcryptjs` para sa password hashing
- `nodemailer` para sa email verification at password-reset OTP
- `cors` para sa frontend-backend communication
- `dotenv` para sa environment variables

Location: `backend/`

### Database

- PostgreSQL
- Raw SQL migrations at seed files
- Walang ORM tulad ng Prisma o Sequelize

Database files:

```text
backend/database/migrations/001_initial_schema.sql
backend/database/migrations/002_email_verification_otp.sql
backend/database/migrations/003_inventory_items.sql
backend/database/migrations/004_inventory_categories_and_change_history.sql
backend/database/migrations/005_inventory_created_audit_action.sql
backend/database/migrations/006_employees_and_audit_logs.sql
backend/database/migrations/007_employee_issuance_returns.sql
backend/database/seeds/001_initial_seed.sql
```

### Authentication features

- Login
- JWT authentication
- Role-based access para sa `IT_ADMIN` at `GSO_STAFF`
- Email verification OTP
- Password reset OTP
- Bcrypt password hashing
- Login event tracking
- Authentication rate-limit records

## 2. Deployment architecture

```text
User browser
    |
    v
Vercel frontend
    |
    | HTTPS API requests
    v
Render Express backend
    |
    +--> Neon PostgreSQL
    |
    +--> Gmail SMTP
```

Halimbawa ng final URLs:

```text
Frontend: https://asset.vercel.app
Backend:  https://asset-backend.onrender.com
API:      https://asset-backend.onrender.com/api/v1
```

## 3. Prerequisites

Kailangan mo ng accounts sa:

1. GitHub, kung saan naka-host ang repository
2. Vercel, para sa frontend
3. Render, para sa backend
4. Neon, para sa PostgreSQL database
5. Gmail o ibang SMTP provider, para sa OTP email

Siguraduhin ding nasa GitHub ang latest version ng repository bago mag-deploy.

## 4. Mga kailangang gawin muna sa VS Code at terminal

Ang section na ito ang checklist bago gumawa ng Vercel, Render, at Neon services. Ang commands ay para sa **PowerShell sa Windows** at dapat i-run nang paisa-isa.

### 4.1 Buksan ang project root

```powershell
cd "C:\Users\hp\OneDrive\ドキュメント\2.React-Projects\2.Project-Asset"
git status
```

Basahin muna ang output ng `git status`. Huwag i-revert o burahin ang existing changes na hindi mo sinadyang gawin.

### 4.2 I-check ang secret files

Huwag kailanman i-commit ang:

```text
backend/.env
```

Ang file na ito ay para sa local development lamang at naglalaman ng database URL, JWT secret, at SMTP credentials. Ang dapat lamang ma-commit ay:

```text
backend/.env.example
```

Kasama na sa project `.gitignore` ang `.env`, `.env.*` (maliban sa `.env.example`), `node_modules`, at build output. I-check pa rin ang files bago mag-commit:

```powershell
git status --short
git diff --cached --name-only
```

Kung aksidenteng na-stage ang `.env`, alisin lamang ito sa staging area nang hindi binubura ang local file:

```powershell
git restore --staged backend/.env
```

### 4.3 I-install at i-validate ang frontend

```powershell
cd "C:\Users\hp\OneDrive\ドキュメント\2.React-Projects\2.Project-Asset\frontend"
npm ci
npm run build
npm run lint
```

Ang `npm ci` ay gumagamit ng committed `package-lock.json`. Dapat maging successful ang `npm run build` at `npm run lint` bago mag-deploy.

Ang `dist/` folder ay build output lamang. Hindi kailangang i-commit ito; Vercel ang gagawa ng build sa deployment.

### 4.4 I-install at i-test ang backend

Sa hiwalay na VS Code terminal:

```powershell
cd "C:\Users\hp\OneDrive\ドキュメント\2.React-Projects\2.Project-Asset\backend"
npm ci
npm start
```

Ang backend ay dapat mag-start sa local `PORT` na nasa `backend/.env` (karaniwang `5000`). Panatilihing bukas ang terminal habang nagte-test. Ihinto gamit ang `Ctrl+C`.

Sa ibang terminal, i-check ang health endpoint:

```powershell
Invoke-RestMethod http://localhost:5000/api/v1/health
```

Dapat may response na:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "database": "connected"
  }
}
```

Kung hindi successful ang health check, ayusin muna ang local `DATABASE_URL` o database setup bago mag-deploy.

### 4.5 I-check ang files na posibleng idagdag

Walang kailangang baguhin sa React, TypeScript, Express, o SQL source code para sa basic deployment.

Optional lamang ang file na ito:

```text
frontend/vercel.json
```

Idagdag lamang ito kung may 404 kapag direktang binuksan o nire-refresh ang `/login`, `/admin`, `/gso`, o ibang frontend route. Ang eksaktong content ay nasa section 9 ng guide na ito.

Hindi kailangang gumawa ng bagong backend server file, database ORM file, o production `.env` file sa repository. Ang production secrets ay ilalagay sa Vercel at Render dashboards.

### 4.6 I-check ang GitHub branch

Tiyaking committed at pushed ang latest changes bago i-connect sa Vercel at Render:

```powershell
cd "C:\Users\hp\OneDrive\ドキュメント\2.React-Projects\2.Project-Asset"
git status
git branch --show-current
git remote -v
```

Pagkatapos ma-review ang files:

```powershell
git add deployment.md
git commit -m "Document deployment preparation and setup"
git push
```

Kung gumawa ka ng optional `frontend/vercel.json`, isama ito:

```powershell
git add deployment.md frontend/vercel.json
git commit -m "Document deployment preparation and setup"
git push
```

Huwag gamitin ang `git add .` nang hindi muna tinitingnan ang `git status`, lalo na dahil may sensitive local environment file.

## 5. Create the Neon PostgreSQL database

1. Pumunta sa [Neon](https://neon.tech).
2. Gumawa ng bagong PostgreSQL project.
3. Piliin ang database name at region.
4. Kopyahin ang PostgreSQL connection string.
5. Buksan ang Neon SQL Editor.
6. I-run ang SQL files sa eksaktong order na ito:

```text
1. backend/database/migrations/001_initial_schema.sql
2. backend/database/migrations/002_email_verification_otp.sql
3. backend/database/migrations/003_inventory_items.sql
4. backend/database/migrations/004_inventory_categories_and_change_history.sql
5. backend/database/migrations/005_inventory_created_audit_action.sql
6. backend/database/migrations/006_employees_and_audit_logs.sql
7. backend/database/migrations/007_employee_issuance_returns.sql
8. backend/database/seeds/001_initial_seed.sql
```

Ginagamit ng initial schema ang `gen_random_uuid()`. Kung mag-error ang unang migration dahil hindi available ang UUID function, i-run muna ito sa Neon SQL Editor at pagkatapos ay ulitin ang migrations:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

Ang connection string ay karaniwang ganito ang format:

```text
postgresql://username:password@host/database?sslmode=require
```

### Bakit kailangan ang order?

- Ang first migration ang gumagawa ng tables, indexes, constraints, at authentication foundation.
- Ang second migration ang nagdadagdag ng `email_verification_otp` token purpose.
- Ang seed file ang naglalagay ng initial roles, permissions, at initial seed records.

> Huwag ilagay ang actual database password sa GitHub, frontend code, o anumang committed file.

## 6. Configure Gmail SMTP

Ginagamit ng backend ang Nodemailer para sa:

- First-login email verification
- Password-reset OTP

Para sa Gmail:

1. I-enable ang 2-Step Verification sa Google account.
2. Gumawa ng Gmail App Password.
3. Gamitin ang 16-character App Password bilang `SMTP_PASS`.
4. Huwag gamitin ang normal Gmail password.

Kung walang SMTP configuration, hindi gagana ang email verification at password reset email. Puwede lamang iwanang blank ang SMTP variables para sa testing ng accounts na verified na.

## 7. Deploy the backend to Render

1. Pumunta sa [Render](https://render.com).
2. Piliin ang **New → Web Service**.
3. I-connect ang GitHub repository.
4. Piliin ang repository na naglalaman ng project.
5. Gamitin ang settings na ito:

```text
Root Directory: backend
Build Command: npm install
Start Command: npm start
```

Ang backend entry point ay `backend/index.js`. Nag-i-start ito ng Express server at nagche-check muna ng database connection bago makinig sa port.

### Render environment variables

Idagdag sa Render service settings ang mga sumusunod:

```text
NODE_ENV=production
FRONTEND_ORIGIN=https://YOUR-VERCEL-DOMAIN.vercel.app
DATABASE_URL=your-neon-postgresql-connection-string
JWT_SECRET=your-long-random-secret-at-least-32-characters
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM=your-email@gmail.com
```

Ang `PORT` ay karaniwang awtomatikong ibinibigay ng Render. Kung hihingi ang Render ng explicit value, gamitin ang port na ipinapakita nito sa service configuration. Huwag i-hardcode ang localhost port para sa production.

### Generate a JWT secret

Ang `JWT_SECRET` ay dapat:

- At least 32 characters
- Random
- Hindi kapareho ng database password
- Hindi naka-commit sa repository

Halimbawa ng paggawa ng random secret sa PowerShell:

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

### Test the backend

Pagkatapos ng successful deployment, buksan:

```text
https://YOUR-RENDER-DOMAIN.onrender.com/api/v1/health
```

Dapat makakuha ng successful response na may status na `ok` at database na `connected`.

Halimbawa:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "database": "connected"
  }
}
```

## 8. Deploy the frontend to Vercel

1. Pumunta sa [Vercel](https://vercel.com).
2. Piliin ang **Add New Project**.
3. I-connect ang GitHub repository.
4. Piliin ang project repository.
5. Gamitin ang settings na ito:

```text
Root Directory: frontend
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

### Vercel environment variable

Sa Vercel project, pumunta sa **Settings → Environment Variables** at idagdag:

```text
VITE_API_BASE_URL=https://YOUR-RENDER-DOMAIN.onrender.com/api/v1
```

I-set ito para sa production environment. Puwede rin itong i-set para sa preview environment kung kailangan.

> Kapag hindi na-set ang `VITE_API_BASE_URL`, gagamit ang frontend ng local default na `http://localhost:5000/api/v1`. Magreresulta ito sa failed API requests sa deployed site.

## 9. SPA route handling sa Vercel

Gumagamit ang frontend ng paths tulad ng:

```text
/login
/forgot-password
/reset-otp
/reset-password
/verify-email
/admin
/admin/users
/gso
/gso/items
/gso/employees
/gso/issuance
/gso/requests-borrowing
```

Kung nagre-return ng 404 ang Vercel kapag direktang binuksan o nirefresh ang isa sa mga paths na ito, magdagdag ng file na `frontend/vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

Pagkatapos magdagdag ng rewrite file, i-commit at i-push ito para mag-trigger ng bagong Vercel deployment.

## 10. Update the backend CORS origin

Pagkatapos makuha ang actual Vercel domain, palitan ang Render variable:

```text
FRONTEND_ORIGIN=https://actual-vercel-domain.vercel.app
```

Huwag gumamit ng trailing slash kung hindi kinakailangan:

```text
Correct:   https://asset.vercel.app
Avoid:     https://asset.vercel.app/
```

Pagkatapos baguhin ang variable, mag-redeploy o mag-restart ng Render service para ma-load ang bagong configuration.

## 11. Create an admin account

Ang repository ay may admin creation script:

```text
backend/scripts/create-admin.js
```

Kung kailangan gumawa ng production admin account, i-run ang script sa backend environment na may production `DATABASE_URL`, ayon sa instructions ng script. Huwag maglagay ng production password sa command history o committed files.

Bago gumawa ng user:

1. Tiyaking na-run na ang migrations.
2. Tiyaking na-run na ang seed.
3. Tiyaking available ang database.
4. Gumamit ng malakas at unique na password.
5. Palitan ang temporary credentials kung mayroon.

## 12. End-to-end testing checklist

### Database

- [ ] Successful ang Neon connection.
- [ ] Na-run ang `001_initial_schema.sql`.
- [ ] Na-run ang `002_email_verification_otp.sql`.
- [ ] Na-run ang `003_inventory_items.sql`.
- [ ] Na-run ang `004_inventory_categories_and_change_history.sql`.
- [ ] Na-run ang `005_inventory_created_audit_action.sql`.
- [ ] Na-run ang `006_employees_and_audit_logs.sql`.
- [ ] Na-run ang `007_employee_issuance_returns.sql`.
- [ ] Na-run ang `001_initial_seed.sql`.
- [ ] May initial roles at permissions.

### Backend

- [ ] Successful ang Render build.
- [ ] Successful ang Render start command.
- [ ] Gumagana ang `/api/v1/health`.
- [ ] Ang health endpoint ay nagre-report ng `database: "connected"`.
- [ ] Tama ang `FRONTEND_ORIGIN`.
- [ ] Naka-set ang `DATABASE_URL`.
- [ ] Naka-set ang `JWT_SECRET`.
- [ ] Naka-set ang SMTP variables kung gagamit ng OTP email.

### Frontend

- [ ] Successful ang `npm run build`.
- [ ] Naka-set ang `VITE_API_BASE_URL`.
- [ ] Gumagana ang landing page.
- [ ] Gumagana ang login.
- [ ] Gumagana ang email verification OTP.
- [ ] Gumagana ang forgot-password flow.
- [ ] Gumagana ang password reset.
- [ ] Gumagana ang admin route.
- [ ] Gumagana ang GSO routes.
- [ ] Hindi nag-404 kapag nirefresh ang internal routes.

## 13. Free-tier limitations

Ang setup na ito ay para sa personal projects, prototypes, school projects, at light usage. Maaaring magkaroon ng pagbabago sa free-tier limits ng bawat provider, kaya tingnan ang kasalukuyang provider documentation bago gamitin sa production.

### Vercel Hobby

- Libre para sa eligible personal, non-commercial projects.
- Ang static Vite frontend ay angkop sa Vercel.
- May usage, build, bandwidth, at request limits.
- Maaaring kailanganin ang paid plan kung commercial ang paggamit o lalampas sa limits.

### Render Free Web Service

- Libre para sa hobby usage.
- Maaaring mag-sleep kapag walang traffic.
- Maaaring magkaroon ng cold start o mabagal na unang request.
- Hindi dapat ituring na always-on production server.
- Ang local filesystem ay hindi persistent storage.

### Neon Free PostgreSQL

- Ang free plan ay may storage, compute, at network limits.
- Maaaring mag-scale-to-zero ang database kapag idle.
- Gumawa ng backup/export bago gumawa ng destructive database changes.

### Gmail SMTP

- May sending limits at anti-abuse rules.
- Gumamit ng App Password, hindi normal account password.
- Para sa mas malaking traffic, gumamit ng transactional email provider.

## 14. Troubleshooting

### `Hindi makakonekta sa backend`

I-check:

1. Running ba ang Render service?
2. Tama ba ang `VITE_API_BASE_URL`?
3. May `/api/v1` ba sa dulo ng URL?
4. Gumagana ba ang backend health endpoint?
5. May CORS error ba sa browser console?

Expected format:

```text
https://YOUR-RENDER-DOMAIN.onrender.com/api/v1
```

### Database connection error sa Render

I-check:

1. Tama ang Neon `DATABASE_URL`.
2. May `sslmode=require` kung hinihingi ng provider.
3. Na-run ang migrations.
4. Available pa ang Neon database.
5. Walang extra quotes o spaces sa environment variable.

### CORS error

I-check ang Render variable:

```text
FRONTEND_ORIGIN=https://YOUR-ACTUAL-VERCEL-DOMAIN.vercel.app
```

Dapat eksaktong tumugma ang origin ng browser sa configured origin.

### Hindi gumagana ang OTP email

I-check:

1. Tama ang `SMTP_HOST`.
2. Ang `SMTP_PORT` ay `587`.
3. Tama ang Gmail address.
4. App Password ang ginamit sa `SMTP_PASS`.
5. Kumpleto ang apat na SMTP variables.
6. Walang accidental spaces sa App Password.

### 404 kapag nirefresh ang route

I-check kung mayroon nang `frontend/vercel.json` SPA rewrite na nasa section 8 ng guide na ito.

### Backend service mabagal sa unang request

Normal ito sa free Render service kapag nag-sleep ang instance. Hintaying matapos ang cold start at subukan muli.

## 15. Security reminders

- Huwag i-commit ang `backend/.env`.
- I-commit lamang ang `backend/.env.example`.
- Huwag ilagay ang `DATABASE_URL`, `JWT_SECRET`, SMTP password, o admin password sa frontend.
- Huwag ilagay ang secrets sa screenshots, documentation, o public issue.
- Gumamit ng unique production credentials.
- Palitan agad ang secret kapag na-expose.
- Regular na mag-export o mag-backup ng production database.
- Huwag gamitin ang development database bilang production database.

## 16. Final deployment summary

```text
1. Run the frontend `npm ci`, build, and lint checks.
2. Run the backend `npm ci`, start the server, and test `/api/v1/health`.
3. Check that `backend/.env` is not staged or committed.
4. Push the reviewed repository changes to GitHub.
5. Create the Neon PostgreSQL database.
6. Run both migrations and the seed SQL.
7. Configure Gmail SMTP/App Password.
8. Deploy `backend/` to Render.
9. Configure Render environment variables.
10. Test the deployed `/api/v1/health`.
11. Deploy `frontend/` to Vercel.
12. Configure `VITE_API_BASE_URL`.
13. Add the optional Vercel SPA rewrite only if internal routes return 404.
14. Update Render `FRONTEND_ORIGIN` with the real Vercel URL.
15. Test login, OTP, password reset, admin, and GSO flows.
```
