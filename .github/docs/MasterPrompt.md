# DYCI GSO Management System

> **Full-Stack Development Blueprint / Project Requirements**  
> Status: Pre-development planning • Version 1.0 • October 2026  
> Scope: GSO Asset Management, Inventory Monitoring, Issuance, Requests, Borrowing, Analytics, and IT Administration.

## 1. Project Overview

The **DYCI (Dr. Yanga's Colleges, Inc.) GSO Management System** is a centralized web application for tracking school assets and consumables, their locations, conditions, custodians, issuance, borrowing, requests, maintenance and retirement. The system must retain historical records rather than simply overwrite past transactions.

### Core objectives
- Monitor what items DYCI owns, their quantity, location, condition, and current status.
- Identify which employee is responsible for each individually tracked asset.
- Track acquisition, issuance, physical release, employee acknowledgment, returns, maintenance and retirement.
- Allow public requesters to submit verified requests without creating permanent accounts.
- Provide operational analytics and exportable reports for GSO.
- Provide secured administrative tools for IT Admin.

## 2. System Architecture and Roles

```text
DYCI GSO Management System
├── GSO Staff Portal
│   ├── Dashboard and Analytics
│   ├── Inventory Management
│   ├── Employee Management
│   ├── Issuance Management
│   ├── Requests and Borrowing
│   ├── Facilities and Vehicles
│   └── Reports
├── IT Admin Portal
│   ├── Admin Dashboard
│   ├── User Management
│   ├── Roles and Permissions
│   ├── Audit Logs
│   ├── Login and Security Logs
│   ├── System Configuration
│   ├── Email Monitoring
│   └── Backup and Recovery
├── Public Portal (no permanent account)
│   ├── Request Forms
│   ├── Email Verification
│   └── Request Tracking
└── Shared Services
    ├── Central Database
    ├── Authentication and OTP
    ├── Notifications
    └── Activity History
```

| Role | Access |
|---|---|
| IT Admin | User/account administration, system configuration, audit/security logs, system monitoring, backup/recovery; optional read-only operational access |
| GSO Staff | Inventory, employee records, issuance, requests, borrowing, facilities/vehicles, analytics and reports according to permissions |
| Public Requester / Employee | Submit forms, verify email, track own requests, acknowledge releases; no permanent account required |

**Permission principle:** IT Admin does not automatically receive permission to modify operational inventory and issuance records. Use role-based access control and server-side authorization.

## 3. GSO Portal Modules

### 3.1 Dashboard
- KPI cards: Total Assets, Issued Assets, Needs Repair, Pending Requests.
- Recent issuance and release activity.
- Pending acknowledgment and overdue borrowing alerts.
- Quick access to common GSO tasks.
- Date, department, category, and condition filters where relevant.

### 3.2 Inventory Management — Item Master Data

**Page functions**
- Search bar.
- Filter by category and date; support additional condition, status, department/location filters.
- Add Item button opening an item creation form.
- Listed records in a searchable, filterable table.
- Open item details and history.
- Edit records with audit trail; archive rather than silently delete.

**Master Data Table / Item Form fields**

| Field | Notes |
|---|---|
| Item Code | Unique identifier for an individually tracked asset; catalog code for stock-based items as appropriate |
| Category | Dropdown, options below |
| Date of Acquisition | Acquisition date |
| Time of Acquisition | Acquisition time, when recorded |
| Item Description | Description/name |
| Cost Per Unit | Original cost per unit |
| Acquisition Cost | Historical acquisition cost; for multiple units, normally quantity × cost per unit |
| Current Assessed Value | Optional separate valuation, not a replacement for acquisition cost |
| Condition | Dropdown, options below; meaningful for individual assets |
| Picture | Optional upload |
| Quantity | Number of units received, especially for consumables |
| Unit of Measure | Piece, box, ream, set, etc. |
| Current Location | Where item/stock is stored or located |
| Inventory Status | Available, Issued, Reserved, Borrowed, etc. |

**Category options — preserve exactly:**
1. Office Supplies
2. Office Equipment
3. Machinery/ Parts
4. Computer Parts/ Peripherals
5. Tools/ Equipment
6. Publications
7. Electrical Supplies
8. Other Consumables
9. Others

**Condition options — preserve exactly:**
1. New
2. Good
3. Fair
4. Needs Repair
5. Under Maintenance
6. Unserviceable
7. Retired

> Category and Condition were initially proposed as radio buttons; **dropdowns are recommended** because there are many options. The options themselves remain unchanged.

**Condition vs. Status:** An asset may have condition `Good` while inventory status is `Issued`. These are separate fields. Acquisition cost remains historical; if value changes due to age or condition, use a separately managed `Current Assessed Value` and consistent valuation policy.

### 3.3 Item Condition Table
- Linked to the master asset record.
- Record condition changes, change date/time, previous/new condition, notes, staff responsible and optional evidence/photo.
- Do not overwrite the historical condition trail.
- Support maintenance-related transitions and retirement.

### 3.4 Employee Management — Employee Master Data
- Employee table with search/filter and profile page.
- Suggested profile details: employee identifier, full name, school email, department, position, status.
- Clicking an employee row opens an **Employee Profile Page**.
- Profile displays all currently assigned assets, complete past issuance history and relevant returns.
- GSO can issue more items to the **same existing employee record**; do not duplicate employees for each issuance.
- Example: Juan Dela Cruz (IT Department, Faculty) has a laptop, office chair and monitor assigned, with their respective item codes and conditions.

### 3.5 Issuance Management

**Views and controls**
- Recent Issuance Table.
- Recent Release Table.
- New Issuance button.
- Issuance details and history.
- Pending Employee Acknowledgment queue.
- Return transaction and return condition recording.

**Issuance table fields**
- Item Code
- Item Category
- Item Description
- Employee Name (recipient)
- Department
- Position
- Date of Issuance
- Time of Issuance
- Condition upon Issuance (editable in this module, with history)

**Allowed issuance condition values:** New, Good, Fair, Needs Repair, Under Maintenance, Unserviceable, Retired. The UI should enforce business rules before releasing unsuitable items; preserving the options does not mean all conditions should be releasable.

**Workflow**
1. **Create Issuance:** GSO selects an existing employee and an available asset; records condition upon issuance.
2. **Record Release:** GSO physically hands over the item and records release time.
3. **Email Acknowledgment:** Send a single-use verification/acceptance link to the employee's email.
4. **Acknowledged:** Employee confirms receipt; store acknowledgment timestamp and transaction link.
5. **Return (when applicable):** GSO records the actual physical return and condition upon return.

Keep `Pending Acknowledgment` visible if the item was released but the employee has not confirmed. **An item is not returned merely because a status was edited.** Issuance, release, acknowledgment and return must be distinguishable events.

### 3.6 Requests & Borrowing

#### A. Request Management
- List of Requests.
- Filters by day/week and request type; optionally by status and date range.
- Approved Requests and Pending Requests views; also support rejection and other lifecycle statuses.
- Clicking a request row opens the submitted form/details, including attachment.

**Request table fields**
- Request Code
- Type of Request Form
- Employee Tagged
- Employee Email
- Date of Forms Submitted
- Time of Forms Submitted (clarifies the repeated date field in the initial draft)
- Verification (authorization file attachment)
- Status

**Request types — preserve exactly:**
1. Purchase Request
2. Job Request
3. Permit to use School Facilities
4. Request for Services
5. Permit to use School Vehicle

Different request types may need additional form-specific fields. Core workflow:

```text
Public Request Form
  → Email Verification
  → GSO Review
  → Approved / Rejected
  → Status Update / Completion as applicable
```

Public requesters **do not need permanent user accounts**. Verify submitted email to reduce fake requests. Generate a Request Tracking Code for status lookup; protect access with verification or a secure token rather than exposing records to anyone who guesses a code.

**Initial product choice:** Standard web forms are the core submission method. An optional chatbot assistant may be added later to guide users to the correct form; it should not replace reliable form submission.

#### B. Borrowing Management
Borrowing is **separate from issuance**:

| Issuance | Borrowing |
|---|---|
| Longer-term assignment to employee | Temporary use |
| May not have a predetermined return date | Has expected return date |
| Employee acknowledgment | Checkout and return confirmation |
| Tracks assigned asset | Tracks borrowed, overdue, returned and damaged items |

Maintain a **Borrowing Records Table** with asset, borrower, release/checkout date, expected return, actual return, condition out, condition in and borrowing status. Avoid double-booking assets and support overdue alerts.

### 3.7 Facilities Master Data
- Facilities Table with facility identifier, name, location, description, capacity, availability/status and optional images.
- Linked to `Permit to use School Facilities` requests and approved usage/reservations.
- Avoid conflicting facility bookings where time windows overlap.

### 3.8 Vehicle Master Data
- Vehicle Table with vehicle identifier, vehicle details, availability/status and relevant maintenance information.
- Linked to `Permit to use School Vehicle` requests and approved usage schedules.
- Avoid conflicting vehicle reservations and record usage history.

### 3.9 Reports
- Inventory summary and detailed item records.
- Issuance and employee assignment reports.
- Requests and borrowing/overdue reports.
- Condition and maintenance reports.
- Exportable filtered data (e.g., CSV/PDF as implementation decisions).
- Historical records remain accessible even when an asset or employee is inactive.

## 4. GSO Analytics

**Initial dashboard KPIs**
- Total Assets
- Issued Assets
- Needs Repair
- Pending Requests

**Charts and insights**
1. Asset Distribution by Category.
2. Item Condition Distribution.
3. Assets by Department.
4. Monthly Acquisition Trends.
5. Inventory Value.
6. Overdue Borrowings.
7. Most Frequently Requested Services.
8. Maintenance Trends.

**Analytics behavior**
- Filter by date range, department, category and condition as applicable.
- Clicking a chart segment drills down into matching records.
- Consistent KPI definitions, e.g., count individually tracked assets separately from consumable stock quantities.
- Illustrative figures from brainstorming (**not real DYCI data**): Total Assets 2,450; Issued Assets 1,820; Needs Repair 84; Pending Requests 32.
- Illustrative category distribution: Office 680, Computer 920, Machinery 310, Electrical 370, Others 170.
- Illustrative condition distribution: Good 1,390; New 620; Fair 310; Needs Repair 84; Others 46.

## 5. IT Admin Modules

| Module | Capabilities |
|---|---|
| Admin Dashboard | Number of accounts, recent activity, system alerts |
| User Management | Create, deactivate and reset GSO staff accounts |
| Role & Permission Management | Control module-level permissions for staff |
| Audit Logs | Who created, changed, approved or archived records; when and what changed |
| Login & Security Logs | Failed logins, account lockouts, suspicious login activity |
| System Configuration | Maintain categories, departments, statuses, request types and other controlled values |
| Email Monitoring | Monitor OTP, issuance acknowledgment and request-notification delivery outcomes |
| Backup & Recovery | Backup scheduling, restoration procedures and recovery verification |

**Admin safeguards:** Audit logs should be tamper-resistant, not freely editable/deletable by ordinary administrators. Prefer soft delete, archiving or deactivation for operational records to preserve history. Limit operational edits by IT Admin unless specifically authorized.

## 6. Authentication, Account Creation and OTP

**There is no public self-registration. Login remains required for IT Admin and GSO Staff.** The public request portal is accessible without an account.

### New GSO Staff / First Login
1. IT Admin creates an account with the staff member's authorized email.
2. System securely sends an activation link or temporary credential; avoid sending reusable passwords in plaintext.
3. Staff verifies email ownership using an OTP.
4. Staff sets a permanent password.
5. Account is activated and staff can use regular login.

### Forgot Password
1. User enters their registered email address.
2. System sends a six-digit OTP using **Nodemailer** and a configured mail provider.
3. User enters the OTP.
4. On successful verification, user creates a new password.
5. Invalidate old password/session credentials as appropriate and record reset in security logs.

**Security requirements**
- Short-lived (e.g., five-minute), single-use OTP.
- Limit verification attempts and resend frequency; rate-limit authentication endpoints.
- Never store OTPs or passwords in plaintext; hash passwords with Argon2id or bcrypt and store OTP verifiers securely.
- Generic forgot-password responses to prevent email enumeration.
- Secure SMTP credentials/environment variables, HTTPS, authorization checks and session management.

### Local development account and startup guidance
- The requested local development identities are `admin@dyci.edu.ph` with role `IT_ADMIN` and `gso@dyci.edu.ph` with role `GSO_STAFF`.
- Provision accounts through a secure local setup or IT Admin workflow. Set a separate private password for each account; hash passwords before storing them. Do not put passwords or user rows in the reference seed, and do not use a shared default password.
- Public self-registration remains disabled. Preserve existing frontend files, including any registration screen, but do not connect that screen to an account-creation endpoint.
- After the one-time PostgreSQL, environment, and account setup is complete, start development in two terminals: `cd backend` then `npm run dev`; and `cd frontend` then `npm run dev`.
- After successful authentication, route `IT_ADMIN` to `/admin` and `GSO_STAFF` to `/gso`; validate protected routes against the backend session.

## 7. Critical Inventory Data Model Decision

**Recommended: combination of individual asset tracking and quantity-based consumable inventory.**

| Individual Assets | Consumable Inventory |
|---|---|
| Laptop, projector, chair, tools | Bond paper, pens, printer ink |
| Unique asset code, possibly serial number | Catalog item and quantity on hand |
| Specific condition, location, employee assignment | Stock received, issued, remaining |
| Individual issuance and return history | Quantity-based stock movement history |

A unified Inventory Management interface may be used, but the underlying database should distinguish:
- **Item Catalog / Master Data** — common item definitions and categories.
- **Individual Assets** — trackable physical units and their unique codes.
- **Consumable Stock Movements** — receipts, issues, adjustments and balances.
- **Condition History** — changes to individual asset condition.
- **Issuance and Release Records** — employee custody and acknowledgment.
- **Borrowing Records** — temporary checkout and return.
- **Request Records** — public submissions and approvals.

Do not count 500 pens as 500 uniquely tracked asset records unless DYCI explicitly needs that. Do not conflate historical acquisition cost with a condition-adjusted current value.

## 8. Proposed Core Tables (Planning Checklist)

The original master-data concepts are preserved and expanded into relational entities for implementation:

- [ ] Item Master Data / Item Catalog
- [ ] Item Condition Table / Condition History
- [ ] Employee Table
- [ ] Facilities Table
- [ ] Vehicle Table
- [ ] Request Table
- [ ] Borrowing Table
- [ ] Individual Assets Table
- [ ] Consumable Stock Movements Table
- [ ] Issuance Table
- [ ] Release / Acknowledgment Records
- [ ] Return Transactions
- [ ] Users and Roles / Permissions
- [ ] OTP / Activation / Reset Tokens
- [ ] Notifications / Email Delivery Logs
- [ ] Audit Logs and Security Logs

**Important relationships:** One employee → many issuances; one individual asset → many historical issuance/condition events but at most one active conflicting custody assignment; one request → its request-specific details and approvals; one borrowing → its checkout/return history. Define primary keys, foreign keys, unique constraints and indexes during ERD design.

## 9. Recommended Implementation Order (No Features Removed)

These phases sequence work; they do **not** remove or cancel any requirement above.

- [ ] **Phase 1 — Planning:** Confirm requirements, statuses, forms, ERD, access matrix, UI wireframes.
- [ ] **Phase 2 — Foundation:** Backend/frontend setup, database, roles, admin-created accounts, login, OTP and forgot password.
- [ ] **Phase 3 — Master Data:** Item catalog, individual assets, consumable stock, conditions, employees, facilities, vehicles.
- [ ] **Phase 4 — Issuance:** New issuance, release, email acknowledgment, employee profile assignment history and returns.
- [ ] **Phase 5 — Requests & Borrowing:** Public verified forms, request review/approval, tracking codes, borrowing checkout/return and overdue handling.
- [ ] **Phase 6 — Analytics & Reports:** KPI dashboard, charts, filters, drill-down, exports.
- [ ] **Phase 7 — IT Admin & Hardening:** Admin dashboard, permission management, audit/security logs, configuration, email monitoring, backups, testing and deployment.

## 10. Open Decisions Before Coding

These are **questions to resolve later**, not deleted features or unilateral changes:
- Confirm final use of hybrid tracking (individual assets + quantity-based consumables).
- Finalize technology stack and deployment environment.
- Confirm approval authorities and any multi-step approvals for each request type.
- Define detailed fields for each public request form and borrowing checkout.
- Confirm whether staff may edit issuance condition after acknowledgment; if so, retain immutable history.
- Agree on current assessed value / depreciation policy if used.
- Finalize facility and vehicle booking rules and maintenance workflows.
- Define permissions for different GSO staff roles.
- Confirm school email/SMTP provider, data privacy and file retention rules.

---

**Development principle:** Preserve the complete agreed scope, implement in phases, maintain transaction history, and design the database before coding the UI workflows.

---

## 11. MANDATORY DEVELOPMENT INSTRUCTIONS — USER CHANGE REQUESTS & FLOW OVERRIDES

> **IMPORTANT FOR CODEX / AI CODING ASSISTANTS:** This section sets the **execution and change-request policy** for future implementation work. It is appended without rewriting Sections 1–10. In any conflict involving a *later, explicit user instruction*, follow that instruction for the requested scope instead of using older preservation language as a reason not to act. Project requirements that the user has **not** changed remain in force.

### 11.1 Priority rule — the latest explicit instruction controls

1. **Follow the user's latest clear, explicit request.** Treat this document as the default specification, not as permission to ignore subsequent changes requested by the project owner.
2. If the user expressly says **delete, remove, replace, rename, move, redesign, or change a workflow**, perform that specific operation after inspecting the relevant files. Do not silently substitute a lesser action (for example, hiding a page instead of deleting it).
3. **An explicit later instruction overrides an older rule such as “preserve existing frontend files,” “do not delete,” or “no features removed” only for the particular files/features the user identifies.** Everything else stays unchanged.
4. Keep explicit requirements from the user separate from agent assumptions and suggestions. A suggestion is not an authorized change until the user accepts it.
5. If two current user instructions are genuinely incompatible, ask **one narrowly targeted clarification** before making a destructive or hard-to-reverse change. Do not use unnecessary clarifications to delay an unambiguous request.

### 11.2 DELETE means actual deletion — not hiding or disabling

When the user says to **delete** a page, component, route, button, workflow, or file:

- **Actually remove the named item(s)** from the project. Do not merely comment out code, set `display: none`, hide a menu item, leave a dead route, or keep a working registration endpoint.
- Inspect the usages and remove **or update only the associated references**: imports, route definitions, links, navigation, redirects, exports, tests, and API wiring that would break or become unused.
- Keep independent features working. Never delete a shared component, schema, security control, or unrelated module just because one removed page happens to use it.
- If a file's exact spelling or path differs, find the corresponding file and carry out the requested removal; mention the actual files changed.
- After modification, run available build/type-check/tests and report what was verified; if a check could not run, state that clearly. **Do not claim a deletion is complete without editing and checking the relevant project files.**
- Where the task risks destroying real user data or production records, do not equate UI deletion with database deletion. Protect operational history and get clarification if a data-destructive operation is not expressly authorized.

#### Concrete example: deleting `register.tsx`

If the user instructs: **“Burahin mo ang register.tsx / alisin mo ang Register page.”**

**Required behavior:**

1. Locate and delete the real registration page file (for example, `frontend/src/auth/register.tsx`, or its actual matching path).
2. Remove the import and `/register` route (if present), Register/Sign Up navigation links, and any registration-only page references or associated tests.
3. Remove any public sign-up API exposure if it exists and is not required for admin-only account creation. Do **not** remove protected IT Admin user-management/account-creation workflows.
4. Keep `login.tsx`, `forgotpassword.tsx`, `resetotp.tsx`, `resetpassword.tsx`, admin-created accounts, and OTP/account-activation security intact unless the user separately orders a change to them.
5. Check that `/register` no longer serves the removed registration UI, that surviving routes build, and that no dangling imports remain.

**Do not respond** “The specification says preserve registration” or keep the registration file merely because Section 6 previously proposed preserving it. That older statement is a **default only**, and an explicit user deletion instruction overrides it. The example above describes what to do *when asked*; it does not authorize an AI agent to delete a file without the user's instruction to do so.

### 11.3 Workflow changes must be implemented end to end

When the user changes a business process (such as issuance, borrowing, requests, approvals, or inventory status):

1. Restate the **new requested flow** in a compact form and identify the old step(s) it supersedes.
2. Inspect the affected frontend pages, route/controller/service/repository logic, validators, PostgreSQL constraints/data relationships, role permissions, notifications, tests, and documentation **as applicable**.
3. Update **all affected layers consistently**. Do not leave the UI following a new flow while the API still enforces the old flow.
4. Preserve historical transaction records and auditability. Create safe forward-only database migrations for schemas already applied to shared environments; do not rewrite deployed history or delete existing user data as a shortcut.
5. Verify success paths, invalid transitions, authorization, and regression behavior. Update the relevant workflow documentation with the new approved process.
6. Preserve unrelated modules and existing working UI/behavior outside the user's requested scope.

### 11.4 Respect scope — make requested changes, not arbitrary improvements

- **User says “only change X” → change X and only the minimal necessary dependencies.** No surprise redesigns, renames, rewrites, folder restructuring, library swaps, or database resets.
- **User says “do not change other code” → protect other code.** If a tiny supporting change is required to prevent errors, make it explicit and limit it to that dependency.
- **User says “keep this feature” → preserve it.** No removal based on agent preferences, unless the user's later instruction expressly reverses that decision.
- Do not use this section as blanket authorization for unrelated destructive operations. The user must identify the change.

### 11.5 Required completion report

After fulfilling a code-change request, report concisely:

- **Requested change:** what the user asked for.
- **Changed / deleted files:** actual paths.
- **References and dependent flows updated:** routes, imports, APIs, or related items, if applicable.
- **Checks run:** build, tests, routes, and results; clearly disclose any unrun checks.
- **Unfinished blockers:** only if any remain.

**Never say “done” just because instructions or a Markdown plan were updated.** A coding request is complete only once actual project code was edited and the performed verification is disclosed.

### 11.6 Quick decision examples

| User request | Correct action | Incorrect substitute |
|---|---|---|
| “Burahin ang `register.tsx`.” | Delete file and clean up its references | Hide Register button only |
| “Tanggalin ang Register link pero huwag burahin ang page.” | Remove link only, leave page intact | Delete `register.tsx` |
| “Palitan ang issuance flow; approval muna bago release.” | Update affected approval → release → acknowledgment flow end to end | Edit only the frontend label |
| “Huwag galawin ang inventory.” | Avoid inventory changes except a minimal necessary dependency identified to the user | Refactor inventory anyway |
| “Burahin ang sample test data.” | Remove identified disposable sample data after confirming scope | Delete real employee or transaction history |

**OVERRIDING PRINCIPLE:** **The latest explicit, authorized user instruction governs the requested change; the rest of this MasterPrompt remains the project baseline.**
