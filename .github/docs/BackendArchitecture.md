# DYCI GSO Management System — FINAL Backend Master Architecture

**Project:** DYCI GSO Management System  
**Version:** 1.0 — Backend Architecture / Pre-Coding Guide  
**Tech Stack:** Node.js, Express.js, PostgreSQL, `pg`, JWT (`jsonwebtoken`), `bcryptjs`, `cors`, `dotenv`, Nodemailer, Nodemon  
**Project root:** `2.Project-Asset/`  
**Scope:** Backend implementation with the minimal frontend authentication wiring needed to call the API and route authenticated roles. Preserve the existing React + TypeScript + Tailwind files and visual design; do not delete or move frontend files. The approved IT Admin user-management change also includes `/admin/users`, the shared AdminNavbar, and first-login email verification UI.

> **Status:** Ito ang **complete folder and architecture reference**, hindi pa working implementation ng lahat ng API o actual database schema. Sa mga susunod na coding phases natin gagawin at ite-test ang JavaScript at SQL contents. Ang lahat ng agreed GSO requirements ay kasama sa plan; wala tayong tinanggal na modules.

---

## 1. Final decisions (ITO ANG SUSUNDIN)

1. Panatilihin ang existing `backend/index.js`, `.env`, `package.json` at `package-lock.json`. **Huwag i-overwrite nang hindi muna nire-review.**
2. Ang buong `database/` ay **nasa loob ng `backend/`**, hindi hiwalay sa project root.
3. **One consolidated initial migration:** `backend/database/migrations/001_initial_schema.sql` — sama-sama rito ang initial PostgreSQL tables, relationships, constraints at indexes.
4. **One consolidated initial seed:** `backend/database/seeds/001_initial_seed.sql` — sama-sama rito ang initial static/reference data. **Huwag maglagay ng real employee records, API secrets, o plaintext passwords dito.**
5. Backend architecture: **Routes → Controllers → Services → Repositories → PostgreSQL**.
6. Separate pa rin ang functional backend modules kahit pinagsama ang initial SQL migrations at seeds.
7. History-first: i-record ang condition changes, stock movements, issuance, physical release, acknowledgment, returns, borrowing, approvals at audit events; huwag basta overwrite ang transaction history.
8. Public request portal: **walang permanent public account at walang public self-registration**. IT Admin ang gagawa ng staff accounts.
9. Ang IT Admin ay **hindi automatic may permission** na mag-edit ng operational inventory records. Server-side role/permission checks ang authority.
10. Ang folder tree sa ibaba ay **target structure**; hindi requirement na isulat agad lahat ng code sa unang araw.
11. Sa frontend, panatilihin ang kasalukuyang layout at assets. Kasama rin sa approved account-management change ang `/admin/users`, shared admin navigation, at first-login OTP verification; huwag baguhin ang unrelated GSO pages.

---

## 2. System architecture at API flow

```text
REACT FRONTEND (existing — ikaw ang may hawak)
  ├── IT Admin pages
  ├── GSO Staff pages
  └── Public request / verification / tracking pages
                │ HTTPS + JSON / multipart upload
                ▼
NODE.JS + EXPRESS BACKEND (backend/index.js → src/app.js)
  ├── Routes          API endpoints, middleware ordering
  ├── Controllers     Request parsing at HTTP response
  ├── Services        Validation beyond input shape, business rules, transactions
  ├── Repositories    Parameterized SQL gamit ang pg
  ├── Middleware      JWT, authorization, validation, errors, upload
  ├── Jobs            Background/scheduled alert and retry jobs (later phase)
  └── Shared Utils    Code generation, email adapter, API responses
                │
                ├────────► PostgreSQL (data, constraints, transaction history)
                └────────► SMTP provider via Nodemailer (OTP + notifications)
```

**Example: Add individual asset**

```text
Frontend form
 → POST /api/v1/inventory/assets
 → inventory.routes.js
 → auth + permission + validate middleware
 → inventory.controller.js
 → inventory.service.js
 → inventory.repository.js
 → PostgreSQL INSERT within a transaction if several tables are changed
 → HTTP response with new asset details
```

**Bakit hiwalay ang service at repository?** Sa `service`, nandiyan ang logic na *bawal mag-issue ng already borrowed asset*. Sa `repository`, ang parameterized SQL na pumipili o nag-u-update ng rows. Hindi dapat diretso ang frontend sa PostgreSQL.

---

## 3. Complete backend folder structure

```text
2.Project-Asset/
├── backend/
│   ├── node_modules/                         # Existing; npm generated; do not commit
│   ├── .env                                  # Existing; SECRET, do not commit
│   ├── .env.example                          # Safe placeholder values only
│   ├── .gitignore                            # Ignore node_modules, .env, uploads etc.
│   ├── package.json                          # Existing; review scripts/dependencies
│   ├── package-lock.json                     # Existing
│   ├── index.js                              # Existing server entry point
│   │
│   ├── src/
│   │   ├── app.js                           # Express configuration + mount module routes
│   │   │
│   │   ├── config/
│   │   │   ├── db.js                         # PostgreSQL Pool (pg)
│   │   │   └── env.js                        # Validated environment config
│   │   │
│   │   ├── modules/
│   │   │   ├── auth/                         # Login, account activation, OTP, reset
│   │   │   ├── users/                        # IT Admin staff accounts, roles/permissions
│   │   │   ├── employees/                    # Employee master data / asset profiles
│   │   │   ├── inventory/                    # Item catalog + individual assets
│   │   │   ├── conditions/                   # Condition change + evidence history
│   │   │   ├── stock/                        # Consumable receipts/issues/adjustments
│   │   │   ├── issuance/                     # Issuance → release → ack → return
│   │   │   ├── borrowing/                    # Temporary checkout + overdue + return
│   │   │   ├── requests/                     # Public forms, email verification, approvals
│   │   │   ├── facilities/                   # Facilities catalog + booking rules
│   │   │   ├── vehicles/                     # Vehicle catalog + booking rules
│   │   │   ├── maintenance/                  # Maintenance events, scheduling, history
│   │   │   ├── analytics/                    # KPI aggregation and chart queries
│   │   │   ├── reports/                      # Filtered exports and printable records
│   │   │   ├── notifications/                # Email jobs, templates, delivery logs
│   │   │   ├── audit/                        # Audit events and login/security history
│   │   │   └── admin/                        # Config, monitoring, backup admin APIs
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js            # Authenticate token/session
│   │   │   ├── role.middleware.js            # Check specific permission / role
│   │   │   ├── validate.middleware.js        # Request validation wrapper
│   │   │   ├── error.middleware.js           # Central error handler
│   │   │   └── upload.middleware.js          # Upload limits/file allowlist
│   │   │
│   │   ├── utils/
│   │   │   ├── generateCode.js               # Asset/request codes (uniqueness in DB)
│   │   │   ├── email.js                      # Reusable mailing helper
│   │   │   └── response.js                   # API success/error response helpers
│   │   │
│   │   └── jobs/
│   │       ├── overdueBorrowings.job.js      # Overdue detection/alerts (later)
│   │       └── notificationRetry.job.js      # Retry failed deliveries (later)
│   │
│   ├── database/                             # DATABASE IS INSIDE BACKEND
│   │   ├── migrations/
│   │   │   └── 001_initial_schema.sql        # ALL INITIAL TABLES + KEYS + INDEXES
│   │   └── seeds/
│   │       └── 001_initial_seed.sql          # ALL INITIAL REFERENCE/LOOKUP DATA
│   │
│   └── tests/
│       ├── unit/                            # Business logic tests
│       └── integration/                     # API + database integration tests
│
├── frontend/                                 # Existing files preserved; minimal auth integration only
└── docs/                                     # Existing project blueprint/docs
```

### 3.1 Files inside **every business module**

Standard naming pattern: `{module}.routes.js`, `{module}.controller.js`, `{module}.service.js`, `{module}.repository.js`, `{module}.validation.js`.

```text
backend/src/modules/inventory/
├── inventory.routes.js
├── inventory.controller.js
├── inventory.service.js
├── inventory.repository.js
└── inventory.validation.js
```

**Gagamitin ang parehong 5-file pattern sa:** `auth`, `users`, `employees`, `inventory`, `conditions`, `stock`, `issuance`, `borrowing`, `requests`, `facilities`, `vehicles`, `maintenance`, `analytics`, `reports`, `notifications`, `audit`, at `admin` **kung kailangan ng bawat layer**. Hindi kailangan ng fake empty endpoints para lang makumpleto ang bilang ng files; puwedeng unti-unting i-implement per phase.

| Module file | Responsibility | Dapat iwasan |
|---|---|---|
| `*.routes.js` | Endpoint method/path + relevant middleware + controller | Raw SQL o complex business logic |
| `*.controller.js` | Read `req`, call service, choose HTTP status/JSON | Direct DB calls; secrets in response |
| `*.service.js` | Business rules, cross-module coordination, DB transaction orchestration | Assuming frontend-only validation is secure |
| `*.repository.js` | Parameterized `pg` queries; return rows; accept transaction client where needed | Building SQL using string interpolation from user input |
| `*.validation.js` | Request-body/params/query schema and constraints | Treating validation as permission checking |

**Note sa transactions:** Gumamit ng iisang checked-out `pg` client para sa multi-query transaction (`BEGIN / COMMIT / ROLLBACK`), hindi hiwa-hiwalay na `pool.query()` calls kung dapat atomic ang buong workflow.

---

## 4. Backend modules: scope at responsibilities

| Folder | Core operations / requirements |
|---|---|
| `auth` | Admin-issued staff account activation; email OTP; login, logout/session invalidation, forgot password, password reset; no public self-registration |
| `users` | Create/deactivate staff login accounts, assign roles and permissions, manage credentials securely |
| `employees` | Employee master table; employee profile; currently issued assets and complete issuance/return history |
| `inventory` | Item catalog and uniquely tracked individual assets; add/edit/list/details/search/filter/archive; acquisition costs/location/status |
| `conditions` | Condition changes with previous/new value, date, actor, notes, evidence and history |
| `stock` | Consumable quantity balance derived from receipts/issues/adjustments, with immutable movements |
| `issuance` | Create issuance, physically release asset, send single-use acknowledgment, confirm, and record physical returns |
| `borrowing` | Temporary item borrowing, expected return, condition out/in, actual return and overdue detection |
| `requests` | Five public request forms, email verification, attachments, review, approval/rejection, protected tracking |
| `facilities` | Facility details and schedules; block overlapping approved bookings |
| `vehicles` | Vehicle details and usage schedule; block overlapping approved bookings |
| `maintenance` | Repair/maintenance records, asset condition updates and supporting logs |
| `analytics` | Total Assets, Issued Assets, Needs Repair, Pending Requests; category/condition/department/value/trend charts |
| `reports` | Inventory, issuance, assignment, requests, borrowing, condition, maintenance exports |
| `notifications` | OTP/ack/request email templates, send queue and delivery/outcome logs |
| `audit` | Operational change history; security log events; failed login tracking |
| `admin` | Admin dashboard, system configuration, email monitoring, backup/recovery coordination |

**Important distinction:** `employees` are people in the employee master list; `users` are authenticated system accounts. Hindi lahat ng employee ay kailangang magkaroon ng login. IT Admin operational access stays permission-controlled.

---

## 5. Database: ONE initial migration at ONE initial seed

### A. `backend/database/migrations/001_initial_schema.sql`

**Ito lang muna ang initial schema SQL file.** Lahat ng `CREATE TABLE`, foreign keys, unique constraints, checks, supporting indexes, at applicable DB protections ay magkakasama rito, nakaayos by dependency.

**Proposed logical table inventory (planning stage; final column-level ERD to be agreed before SQL coding):**

| Group | Proposed tables | Purpose |
|---|---|---|
| Authentication | `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `auth_tokens`, `login_events` | Accounts, RBAC, OTP/activation/reset verifier metadata, security logs |
| Master/reference | `departments`, `item_categories`, `item_conditions`, `request_types`, `locations` | Shared lookup values |
| People | `employees` | Non-duplicated employee profiles |
| Inventory | `item_catalog`, `individual_assets`, `asset_condition_history`, `stock_movements` | Individual asset tracking + consumable movements |
| Issuance | `issuances`, `asset_releases`, `issuance_acknowledgments`, `asset_returns` | Full custody lifecycle |
| Borrowing | `borrowings`, `borrowing_events` | Temporary checkout, return and overdue history |
| Requests | `requests`, `request_attachments`, `request_verifications`, `request_approvals`, `request_status_history`, `purchase_request_details`, `job_request_details`, `facility_request_details`, `service_request_details`, `vehicle_request_details` | Public submissions and 5 request-type details |
| Facilities & vehicles | `facilities`, `facility_reservations`, `vehicles`, `vehicle_reservations` | Reservation availability and history |
| Maintenance | `maintenance_records` | Scheduled/completed work and history |
| Notifications | `notifications`, `email_delivery_logs` | Messages and outcomes |
| Audit/admin | `audit_logs`, `system_settings` | Operational change logs and configuration |

> **Design status:** Mga proposed table names ito, hindi pa approved column-by-column SQL schema. Ang exact tables/columns ay ita-tie natin sa finalized ERD at request forms. Maaaring dagdagan ng necessary child tables sa parehong initial migration without deleting core features.

#### Non-negotiable database relationships and protections

- **One employee → many issuances**, pero iisang employee profile lang.
- **One catalog item → many individual assets**, kung trackable per unit.
- **One asset → many historical condition/issuance/borrowing events**, pero bawal ang conflicting active custody.
- **Consumable stock → movement history**; quantity cannot be silently changed without adjustment record.
- **One public request → verification, attachments, review history, and corresponding request-type details**.
- **Facility and vehicle booking windows → no conflicting approved reservations**; enforce safely under concurrent requests (transaction/locking or suitable PostgreSQL constraints).
- Unique `item_code`/`asset_code`/`request_code`, as applicable; use database `UNIQUE` constraints.
- Preserve acquisition cost historically; optional `current_assessed_value` is a separate value.
- `condition` and `inventory_status` are different concepts (e.g. `Good` + `Issued`).
- Use `NUMERIC` for money, `TIMESTAMPTZ` for event timestamps, `DATE` where calendar date is intended, and foreign keys for references.
- Avoid hard-deleting operational transactions; use controlled archival/deactivation where appropriate.

#### Suggested internal sections in the **single file**

```sql
-- 001_initial_schema.sql
-- SECTION 01: Extensions (if justified) and shared setup
-- SECTION 02: Lookup/reference tables
-- SECTION 03: Staff accounts, RBAC, OTP/token metadata
-- SECTION 04: Employee master data
-- SECTION 05: Item catalog, individual assets, stock movements
-- SECTION 06: Condition and maintenance history
-- SECTION 07: Issuance, release, acknowledgments, returns
-- SECTION 08: Public requests, verification, approvals, details
-- SECTION 09: Borrowing and related activity
-- SECTION 10: Facilities, vehicles, and reservations
-- SECTION 11: Notifications, email delivery and audit logs
-- SECTION 12: System settings, constraints and indexes
```

**Important:** Ang section labels sa itaas ay *outline*, hindi pa runnable SQL. Gagawa tayo ng totoong `CREATE TABLE` statements **pagkatapos** i-finalize ang ERD para hindi mali-mali ang keys.

### B. `backend/database/seeds/001_initial_seed.sql`

**Ito lang muna ang initial seed SQL file.** Sasaluhin nito ang lahat ng initial dropdown/static choices at permission reference values.

**Item categories — preserve EXACT names:**

1. Office Supplies
2. Office Equipment
3. Machinery/ Parts
4. Computer Parts/ Peripherals
5. Tools/ Equipment
6. Publications
7. Electrical Supplies
8. Other Consumables
9. Others

**Item conditions — preserve EXACT names:**

1. New
2. Good
3. Fair
4. Needs Repair
5. Under Maintenance
6. Unserviceable
7. Retired

**Request types — preserve EXACT names:**

1. Purchase Request
2. Job Request
3. Permit to use School Facilities
4. Request for Services
5. Permit to use School Vehicle

**Other seed groups (proposed):** `IT_ADMIN` and `GSO_STAFF` roles, granular permissions, default status options, units of measure and safe application settings **once approved**. Do **not** assume actual DYCI departments, employee information, SMTP credentials, or admin password unless provided/verified. Initial admin account should be provisioned securely, not hardcoded in public seed SQL.

#### Seed behavior guidelines

- Run **migration first**, then seed.
- Prefer repeat-safe `INSERT ... ON CONFLICT ...` for stable lookup keys, but avoid silently overwriting edited operational data.
- Keep **demo/test data separate** from this initial production reference seed.
- Record applied database version (migration tracking) once actual deployment workflow is built.
- **Consolidated initial** doesn't mean edits to an already-deployed migration are safe: once shared/production DBs have applied `001`, create `002_...sql` for future changes rather than rewriting `001`.

---

## 6. Required workflows na hindi dapat mawala

### 6.1 Individual assets versus consumable stock

```text
Item Catalog (definition/category)
├── INDIVIDUAL ASSET: laptop, projector, chair, tools
│   ├── unique asset code
│   ├── condition + history
│   ├── current location/status
│   └── issuance / borrowing / return history
└── CONSUMABLE STOCK: bond paper, pen, ink
    ├── unit of measure
    ├── received / issued / adjusted quantity
    └── quantity on hand from stock movements
```

Huwag i-represent ang 500 pens bilang 500 uniquely serialized assets kung hindi kailangan.

### 6.2 Issuance is NOT just a status change

```text
New Issuance
 → Physical Release recorded
 → Employee acknowledgment link emailed
 → Employee confirms acknowledgment
 → Physical Return recorded (only when it actually happens)
 → Return condition + history stored
```

*Pending Acknowledgment* must remain visible after release until accepted. Hindi automatic return kapag inedit lang ang status. Bawal din mag-release ng asset na unavailable o unsuitable ang condition.

### 6.3 Borrowing is different from issuance

- Issuance = usually longer-term custody/assignment; may not have a target return date.
- Borrowing = temporary checkout with **expected return date**; track overdue, actual return, and condition before/after.
- Both must prevent conflicting active use of the same individual asset.

### 6.4 Public request verification

```text
Public request form
 → Email verification
 → Verified request record
 → GSO review
 → Approve or reject (with decision history)
 → Completion / subsequent request-type workflow
 → Secure status tracking using verification or secure token
```

No permanent public account. Keep attachment validation and access checks. Any chatbot can be *optional later* and must not replace forms.

### 6.5 Login, activation, OTP & password reset

- IT Admin creates authorized GSO staff account.
- For newly created GSO accounts, the current approved flow uses the shared initial password `Admin123`, stored only as a bcrypt hash. On the first successful email/password sign-in, send a six-digit email OTP; successful verification marks the address verified and signs the staff member in. Later sign-ins use email/password without another verification OTP.
- Keep the existing seeded `admin@dyci.edu.ph` and `gso@dyci.edu.ph` accounts pre-verified and unchanged.
- Forgot password: short-lived 6-digit OTP, hash verifier, expiry, attempt/resend limits and rate limiting.
- Store bcrypt-hashed passwords; never email reusable passwords in plaintext.
- Use JWT/token or secure session strategy with revocation/session invalidation policy, HTTPS and permission checks on backend.
- Log security events without logging OTPs, raw passwords or auth tokens.

### Local development account bootstrap and role routing

- Preserve the existing local development identities `admin@dyci.edu.ph` (`IT_ADMIN`) and `gso@dyci.edu.ph` (`GSO_STAFF`) and their current login behavior. IT Admin-created GSO accounts use the approved initial password flow above; only bcrypt hashes are stored, and the email must pass one-time OTP verification on first sign-in.
- Keep public self-registration disabled. Existing registration frontend files may remain in the repository, but they must not create accounts.
- The frontend login handler calls `POST /api/v1/auth/login`; after success, it routes by the server-returned role (`IT_ADMIN` to `/admin`, `GSO_STAFF` to `/gso`). Protected dashboard routes verify the session through `GET /api/v1/auth/me`.
- After the one-time database, `.env`, and account provisioning steps are complete, routine local startup uses two VS Code terminals: `cd backend` then `npm run dev`; and `cd frontend` then `npm run dev`.

---

## 7. Initial REST API route map (planning guide)

All routes below are **proposed** ` /api/v1 ` conventions; adjust only when integrating existing backend routes. This is a route map, **not implemented endpoints yet**.

| Backend module | Proposed URL prefix | Example actions |
|---|---|---|
| `auth` | `/api/v1/auth` | `POST /login`, `/verify-email-otp`, `/forgot-password`, `/verify-otp`, `/reset-password`, `/activate` |
| `users` | `/api/v1/users` | `GET /`, `POST /`, `PATCH /:id`, `PATCH /:id/roles` |
| `employees` | `/api/v1/employees` | `GET /`, `POST /`, `GET /:id`, `GET /:id/issuances` |
| `inventory` | `/api/v1/inventory` | `GET /catalog`, `POST /catalog`, `GET /assets`, `POST /assets`, `GET /assets/:id` |
| `conditions` | `/api/v1/conditions` | `GET /assets/:assetId/history`, `POST /assets/:assetId/changes` |
| `stock` | `/api/v1/stock` | `GET /balances`, `GET /movements`, `POST /movements` |
| `issuance` | `/api/v1/issuances` | `POST /`, `POST /:id/release`, `POST /:id/acknowledge`, `POST /:id/return` |
| `borrowing` | `/api/v1/borrowings` | `POST /`, `POST /:id/checkout`, `POST /:id/return`, `GET /overdue` |
| `requests` | `/api/v1/requests` | `POST /`, `POST /:id/verify`, `GET /:id`, `POST /:id/decision` |
| `facilities` | `/api/v1/facilities` | `GET /`, `POST /`, `GET /:id/reservations` |
| `vehicles` | `/api/v1/vehicles` | `GET /`, `POST /`, `GET /:id/reservations` |
| `maintenance` | `/api/v1/maintenance` | `GET /`, `POST /`, `PATCH /:id` |
| `analytics` | `/api/v1/analytics` | `GET /overview`, `/categories`, `/conditions`, `/trends` |
| `reports` | `/api/v1/reports` | `GET /inventory`, `/issuances`, `/requests` (filtered exports) |
| `notifications` | `/api/v1/notifications` | `GET /delivery-logs`, authorized resend where applicable |
| `audit` | `/api/v1/audit` | `GET /events`, `GET /security-events` |
| `admin` | `/api/v1/admin` | `GET /overview`, `GET/PATCH /settings`, monitoring/backup endpoints |

**Access rules:** Public requests/verification/status routes must be narrowly scoped. All protected CRUD/analytics/export endpoints require backend identity and authorization checks, **not just frontend route guards**. Never expose arbitrary request data from guessable tracking codes.

---

## 8. Environment and security

Recommended keys for `backend/.env.example` (placeholders only):

```dotenv
NODE_ENV=development
PORT=5000
FRONTEND_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://postgres:CHANGE_ME@localhost:5432/dyci_gso
JWT_SECRET=REPLACE_WITH_LONG_RANDOM_SECRET
SMTP_HOST=mail.example.com
SMTP_PORT=587
SMTP_USER=example@example.com
SMTP_PASS=REPLACE_ME
SMTP_FROM=no-reply@example.com
```

- Use real secrets **only inside `.env`**, never commit the actual `.env`.
- If credentials were already committed, rotate them and remove them from Git history appropriately.
- Restrict CORS to known frontend origin(s); CORS is **not** an authentication control.
- Use parameterized `pg` SQL (`$1`, `$2`, ...) to avoid SQL injection.
- Validate uploaded evidence/photos using allowlisted formats, file-size limits, private storage and authorization before serving.
- Apply RBAC and audit logging to privileged actions; lock down backup/recovery operations.
- Provide sensible limits on login, OTP, public submissions and expensive export endpoints.
- Do not expose sensitive employee/contact information in unauthenticated API results.
- Do not put uploaded attachments under public web hosting by default.

Suggested `.gitignore` patterns (only append missing patterns; do not erase existing configuration):

```gitignore
node_modules/
.env
.env.*
!.env.example
uploads/
coverage/
*.log
```

---

## 9. Setup instructions in VS Code (PowerShell)

### Step 1 — Terminal working directory

Kung nasa `backend` ka ngayon:

```powershell
cd ..
```

Dapat ang current terminal directory ay nagtatapos sa `2.Project-Asset>` (project root). **Do not run `cd ..` kung nasa root ka na**; tingnan muna ang prompt.

### Step 2 — Create backend folders (safe for existing content)

```powershell
# Run this FROM 2.Project-Asset project root
$folders = @(
    "backend/src/config",
    "backend/src/middleware",
    "backend/src/utils",
    "backend/src/jobs",
    "backend/database/migrations",
    "backend/database/seeds",
    "backend/tests/unit",
    "backend/tests/integration"
)

$modules = @(
    "auth", "users", "employees", "inventory", "conditions",
    "stock", "issuance", "borrowing", "requests", "facilities",
    "vehicles", "maintenance", "analytics", "reports",
    "notifications", "audit", "admin"
)

foreach ($module in $modules) {
    $folders += "backend/src/modules/$module"
}

foreach ($folder in $folders) {
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
}

Write-Host "Backend folders created. Existing files are preserved."
```

### Step 3 — Create missing backend files WITHOUT overwriting existing files

```powershell
# Run this FROM 2.Project-Asset project root
$files = @(
    "backend/.env.example",
    "backend/.gitignore",
    "backend/src/app.js",
    "backend/src/config/db.js",
    "backend/src/config/env.js",
    "backend/src/middleware/auth.middleware.js",
    "backend/src/middleware/role.middleware.js",
    "backend/src/middleware/validate.middleware.js",
    "backend/src/middleware/error.middleware.js",
    "backend/src/middleware/upload.middleware.js",
    "backend/src/utils/generateCode.js",
    "backend/src/utils/email.js",
    "backend/src/utils/response.js",
    "backend/src/jobs/overdueBorrowings.job.js",
    "backend/src/jobs/notificationRetry.job.js",
    "backend/database/migrations/001_initial_schema.sql",
    "backend/database/seeds/001_initial_seed.sql"
)

$modules = @(
    "auth", "users", "employees", "inventory", "conditions",
    "stock", "issuance", "borrowing", "requests", "facilities",
    "vehicles", "maintenance", "analytics", "reports",
    "notifications", "audit", "admin"
)

foreach ($module in $modules) {
    foreach ($layer in @("routes", "controller", "service", "repository", "validation")) {
        $files += "backend/src/modules/$module/$module.$layer.js"
    }
}

foreach ($file in $files) {
    $parent = Split-Path -Parent $file
    if (-not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    if (-not (Test-Path $file)) {
        New-Item -ItemType File -Path $file | Out-Null
    }
}

Write-Host "Missing files created. Existing files were NOT overwritten."
```

**Important:** This command creates **placeholder files** (empty). `npm start` will not magically work until the actual `app.js`, routes, database connection and scripts are implemented. Existing `index.js` is left intact.

### Step 4 — Install dependencies (inside backend folder)

```powershell
cd backend
npm install express pg cors dotenv jsonwebtoken bcryptjs nodemailer
npm install -D nodemon
```

If `nodemailer` is already installed as shown in your terminal screenshot, the installation command will simply reconcile dependencies. Additional packages for validation, file uploads, rate limiting and exports will be selected when we implement the corresponding modules.

### Step 5 — Inspect files before writing production code

```powershell
Get-Content package.json
Get-Content index.js
```

**Do not replace existing index.js blindly**, since authentication logic and other current routes may already exist. We will refactor incrementally with a backup/commit and tests.

### Step 6 — Inspect output

```powershell
# Still inside backend
Get-ChildItem src -Recurse | Select-Object FullName
Get-ChildItem database -Recurse | Select-Object FullName
```

You may not see empty directories/files in GitHub after pushing unless they contain tracked files. Don't commit secrets or `node_modules/`.

### Step 7 — Routine local startup after first-time setup

Open two VS Code terminals at the project root. In the first, run `cd backend` followed by `npm run dev`. In the second, run `cd frontend` followed by `npm run dev`. PostgreSQL, the database schema/seed, `.env`, and the initial IT Admin account must already be set up.

---

## 10. Back-end implementation sequence (all modules retained)

- [ ] **Phase 1 — Architecture:** Confirm this folder tree, ERD, permission matrix, request-specific forms, workflow/status definitions.
- [ ] **Phase 2 — Foundation:** Review existing `index.js`; setup `src/app.js`, `.env.example`, `pg` DB pool, error handler, health endpoint, initial API testing.
- [ ] **Phase 3 — Database:** Finish ERD; write **single** `001_initial_schema.sql` and **single** `001_initial_seed.sql`; apply to a development database; check constraints and re-run behavior.
- [ ] **Phase 4 — Authentication:** Admin-created users, activation, login, OTP, forgot/reset password, JWT/session protection, permissions and security logs.
- [ ] **Phase 5 — Master Data:** Catalog, individual assets, consumables, condition history, employees, facilities and vehicles.
- [ ] **Phase 6 — Issuance:** Issuance/release, email acknowledgment, employee profile history, returns and audit trail.
- [ ] **Phase 7 — Requests/Borrowing:** Five public request types, verification, approvals, protected tracking, borrowing and overdue alerts.
- [ ] **Phase 8 — Analytics/Reports:** KPI definitions, dashboards API, date/category/department filters, drill-down, exports.
- [ ] **Phase 9 — IT Admin & Hardening:** Admin endpoints, logs, settings, email monitoring, backup/recovery approach, tests and deployment checks.

### Must-test behaviors

- [ ] Duplicate `asset_code`/`request_code` rejected by DB uniqueness rules.
- [ ] One already-issued/borrowed asset cannot be concurrently borrowed/issued by someone else.
- [ ] Physical release and employee email acknowledgment are stored as separate events.
- [ ] Physical return requires a real return transaction and condition record.
- [ ] Consumable adjustments always produce movement history.
- [ ] Employee master record reused for repeat issuances, without duplicates.
- [ ] Request tracking cannot expose another person's sensitive data.
- [ ] IT Admin cannot automatically edit GSO operational data without explicit permission.
- [ ] Facility/vehicle reservation conflicts rejected under concurrent bookings.
- [ ] Passwords/OTP verifiers are never stored or logged as plaintext.
- [ ] Migration and seed are reviewed/tested before applying to any shared DB.
- [ ] Reports and dashboards use consistent definitions for individually tracked assets versus consumable quantities.

---

## 11. Decisions to confirm before final ERD/SQL

These are **open decisions** from the project requirements; they do not remove features:

1. Final tracking rules for specific inventory categories: individually tracked asset vs quantity-based consumable.
2. Request-type-specific form fields and approval authorities/stages.
3. Borrower details and borrowing checkout/return rules.
4. GSO user permissions vs IT Admin permissions (detailed matrix).
5. Exact status workflow, who can edit condition after acknowledgment, and immutable history policy.
6. Facility and vehicle reservation time windows / approval rules.
7. Optional current assessed value/depreciation policy.
8. DYCI official department/location lists for seed data.
9. SMTP provider, storage of uploaded evidence, backup target and retention/data privacy rules.

---

## 12. Where to save this Markdown file

Recommended destination in the existing project:

```text
2.Project-Asset/docs/DYCI_GSO_FINAL_BACKEND_ARCHITECTURE.md
```

This document is your **backend source-of-truth for architecture and folder structure**. Use the original `DYCI_GSO_System_Development_Blueprint` alongside it as the **functional requirements source-of-truth**; architecture does not replace the requirements.

**Next action:** Create the folder/file scaffold, then inspect `backend/index.js` and `backend/package.json` before implementing `src/app.js` and PostgreSQL connection.


---

## 13. CHANGE REQUEST & FLOW UPDATE RULES — MANDATORY DEVELOPMENT INSTRUCTIONS

> **Purpose:** Kapag ang project owner ay nagpabago ng workflow, business rule, status, approval process, API behavior, o database relationship, **ang pinakabagong malinaw at explicitly approved na instruction ng project owner ang susundin**. Ang dokumentong ito ay living architecture guide, hindi dahilan para balewalain ang bagong requirements. Hindi nito pinapahintulutan ang automatic destructive changes o paglabag sa security at data integrity.

### 13.1 Priority at scope ng changes

1. **Follow the latest explicit project-owner request** for the named flow or feature. Ang mas bagong approved change ang pumapalit sa conflicting *older project decision* para lamang sa affected scope.
2. **Preserve everything not requested to change.** Huwag mag-delete, mag-rename, mag-restructure, o mag-rewrite ng unrelated modules, database objects, frontend files, o working functionality.
3. **Do not interpret a proposed idea as an approved change.** Kapag brainstorming pa lang o ambiguous ang instruction, ipakita muna ang proposed flow at humingi ng confirmation bago gumawa ng breaking changes.
4. **Keep security and data integrity intact.** Hindi dapat bypass ang authentication, authorization, audit trail, transaction history, validation, at DB constraints. Kapag conflicting ang bagong flow sa safeguards, ipaliwanag ang conflict at magmungkahi ng safe implementation.
5. **Respect frontend ownership.** Backend lang ang babaguhin unless explicitly requested ang frontend. Kapag may API contract change, ilista ang kailangan i-update sa frontend, pero huwag basta galawin ang frontend files.

### 13.2 Required workflow whenever a flow change is requested

**Step 1 — Understand:** Isulat ang **Current Flow → Requested New Flow** at kung anong eksaktong behavior ang nagbabago. Huwag mag-assume ng missing approval rules, fields, o statuses.

**Step 2 — Impact analysis:** Tukuyin ang affected backend modules, routes, controllers, services, repositories, validations, database tables, migration/seed requirements, roles/permissions, notifications, reports/analytics, at tests. Tukuyin ang possible breaking changes.

**Step 3 — Preserve and plan:** Panatilihin ang unaffected workflows at historical records. Kung may existing records, gumawa ng migration/backfill/compatibility plan kung kinakailangan. Huwag mag-reset ng database para lang gumana ang bagong flow.

**Step 4 — Implement consistently:** Sundin ang `Routes → Controllers → Services → Repositories → PostgreSQL` architecture. I-update ang lahat ng affected backend layers; huwag mag-iwan ng old validation/status logic na sumasalungat sa bagong flow. Gumamit ng transactions kung multi-table ang operation.

**Step 5 — Database discipline:** Mananatiling **one consolidated initial schema** at **one consolidated initial seed** para sa initial development setup. Kung na-apply na ang `001_initial_schema.sql` sa shared/production database, **huwag itong baguhin retroactively**: gumawa ng numbered incremental migration (`002_...sql`, etc.). Huwag maglagay ng live data o credentials sa seed.

**Step 6 — Test:** Magdagdag/mag-update ng unit at integration tests para sa bagong happy path, invalid transitions, authorization, concurrency, at regression ng existing flow. I-report kung alin ang na-run at alin ang hindi pa na-test.

**Step 7 — Update documentation:** I-update ang relevant flow/status diagrams, API contracts, ERD/database notes, permission matrix, at ang change log sa ibaba. Kapag ang architecture guide at approved requirement ay nag-conflict, i-reconcile ang dokumento para hindi na mauulit ang lumang behavior.

### 13.3 Change request response format

Sa bawat bagong request na nagpapabago ng flow, gamitin itong concise template bago o kasabay ng implementation:

```text
CHANGE REQUEST: [feature / module]
CURRENT FLOW: [existing behavior]
NEW APPROVED FLOW: [requested behavior]
AFFECTED BACKEND: [modules / endpoints / files]
DATABASE IMPACT: [none / migration / seed / backfill]
SECURITY & HISTORY IMPACT: [permissions / audit / historical records]
FRONTEND CONTRACT IMPACT: [none / changes to communicate]
TEST PLAN: [tests to update or add]
STATUS: [proposed / approved / implemented / tested]
```

Kung malinaw at low-risk ang request, puwedeng diretso nang mag-implement at magbigay ng short impact summary. Kung may ambiguity na makakaapekto sa data o permissions, magtanong muna bago mag-implement.

### 13.4 Non-negotiable safeguards during changes

- **Never silently remove features** from the agreed GSO scope unless explicitly approved.
- **Never rewrite transaction history** to fit a new flow; add new events or controlled correction records.
- **Never silently change status values** in a way that misrepresents physical release, acknowledgment, checkout, or return.
- **Never create conflicting active asset custody or facility/vehicle reservations.**
- **Never deploy unreviewed destructive SQL** (`DROP`, mass `DELETE`, destructive `ALTER`) or overwrite existing source files without reviewing them.
- **Never claim a change was implemented or tested** unless the corresponding files were actually modified or tests executed.
- **Never use this document to override a newer explicit project-owner decision.** Record the approved update in the document instead.

### 13.5 Change log (append each approved flow revision)

| Date | Module | Previous flow | Approved new flow | Files/DB affected | Status |
|---|---|---|---|---|---|
| 2026-10-13 | GSO account creation / first login | Admin-created staff account activation flow | IT Admin creates a GSO account with the shared initial password; first correct sign-in requires one-time email OTP, then later sign-ins use email/password. Preserve both seeded accounts. | `frontend/src/admin/usermanagement.tsx`, `frontend/src/components/navbars/adminnavbar.tsx`, auth/users APIs, migration `002_email_verification_otp.sql` | Implemented; local migration applied |
| 2026-10-13 | First-login OTP retry | A recently used or invalidated verification token could block login with a one-minute cooldown error | Correct credentials can request a new email OTP when no active challenge remains; existing hourly request and per-code attempt limits remain | `backend/src/modules/auth/auth.service.js`, `backend/src/modules/auth/auth.repository.js`, `installations.md` | Implemented; Node syntax and diff checks passed |

> **For coding assistants:** Read this section together with the relevant current source files and the functional blueprint before implementing a change. This document guides development but does not automatically enforce rules in an editor or coding agent; include these instructions in the agent's project context when applicable.
