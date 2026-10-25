# A.S.S.E.T — Core Modules and Functional Scope

**System Name:** A.S.S.E.T  
**Description:** School Asset & General Services Management System  
**Purpose:** Magkaroon ng fully functional at deployable system na ang scope ay naka-focus sa General Services Office (GSO) responsibilities, hindi isang buong School ERP.

## 1. Eight Core Modules of A.S.S.E.T

| # | Module | Main Functionalities |
|---|---|---|
| 1 | **Asset & Inventory Management** | Item Master Data, categories, quantity, condition, location, asset receiving, stock monitoring |
| 2 | **Employee & Department Management** | Employee records, departments, assigned assets, accountability history |
| 3 | **Borrowing & Return Management** | Borrowing requests, approval/rejection, issuance, due dates, returns, overdue tracking |
| 4 | **GSO Request Management** | Purchase Requisition, Job/Service Request, Facility Use Request, Loss/Damage Report |
| 5 | **Asset Issuance & Accountability** | Permanent issuance, employee assignment, transfer, turnover records, condition upon issuance |
| 6 | **Dashboard & Analytics** | Inventory statistics, request monitoring, asset conditions, issued items, overdue summaries |
| 7 | **Reports & Audit Management** | Inventory reports, borrowing history, issuance reports, PDF/CSV export, activity logs |
| 8 | **System Administration & Security** | Login, RBAC, user management, account security, database backups |

Ang mga module na ito ay nakabatay sa asset inventory, issuance, borrowing, request management, reporting, at security requirements sa *POSSIBLE CORE FUNCTIONALITIES (ASSET)(3).pdf*.

## 2. Features to Retain Without Creating Separate Modules

- **QR/Barcode Tagging** — Feature sa Asset & Inventory Management.
- **Low-Stock Alerts** — Feature sa Asset & Inventory Management.
- **Overdue Notifications** — Feature sa Borrowing & Return Management.
- **Basic Maintenance Tracking** — Feature sa GSO Request Management.
- **Facility Reservations** — Sakop ng GSO Request Management, kung GSO ang responsible sa facility approval.
- **Asset Lifecycle & Disposal** — Feature sa Asset & Inventory Management.
- **Report Generation for Purchase Requests** — Feature sa GSO Request Management; GSO Staff ang magpapasa sa Purchasing/Finance externally.

## 3. Final System Structure

```text
A.S.S.E.T
School Asset & General Services Management System
│
├── 1. Asset & Inventory Management
├── 2. Employee & Department Management
├── 3. Borrowing & Return Management
├── 4. GSO Request Management
├── 5. Asset Issuance & Accountability
├── 6. Dashboard & Analytics
├── 7. Reports & Audit Management
└── 8. System Administration & Security
```

## 4. Out of Scope: Full Standalone Systems

Hindi na kailangang idagdag ang buong sumusunod na systems:

- Finance Management / Finance Approval Pipeline
- Purchasing / Supplier Canvassing
- IT Helpdesk
- Fleet & Fuel Management
- Contractor Management

**Important:** Mananatili ang existing Purchase Requisition form. Ang A.S.S.E.T ay para sa request submission, GSO review, report generation, external forwarding, at request status tracking lamang. Walang Finance account, Finance dashboard, o Finance approval processing sa loob ng system.

## 5. Implementation Guidelines

1. **Huwag agad magbura o gumawa ng bagong modules.** May existing code na ang A.S.S.E.T.
2. **I-review muna ang walong core modules:** alamin kung alin ang complete na, alin ang may kulang, at alin ang kailangan lang i-improve.
3. **I-preserve ang working features at existing data.** Ang pagbabawas ng scope ay hindi awtomatikong dahilan para burahin ang related records o existing functionality.
4. **Unahin ang connected workflows:** asset records → request/approval → issuance/accountability → return/monitoring → reports/audit.
5. **Iwasan ang unnecessary complexity.** Mas mahalaga ang complete, functional, at deployable system kaysa sa sobrang lawak na feature list.

## 6. Project Goal

Makabuo ng **fully functional at deployable A.S.S.E.T system** na akma sa school General Services Office, may malinaw na responsibility boundaries, at hindi lumalaki tungo sa isang buong School ERP.
