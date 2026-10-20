# A.SSET System Completion Plan
## Admin Management and GSO Requesting & Borrowing

### Purpose

Ang document na ito ay praktikal na solution plan para kumpletuhin ang mga bahaging hindi pa konektado o wala pa sa A.SSET system—lalo na ang **IT Admin workspace** at **GSO Requests & Borrowing**. Nakabatay ito sa kasalukuyang frontend, backend routes, database migrations, at installation guide ng project.

Ang target ay isang maayos na end-to-end process:

```text
Verified requester -> Borrowing request -> GSO review -> Reservation
                   -> Physical release -> Return/inspection -> Closure
```

Planning document lamang ito. Walang application code na binago.

---

## 1. Kasalukuyang Kalagayan at Mga Pangunahing Gap

| Area | Meron na ngayon | Kulang o hindi pa tapos |
|---|---|---|
| IT Admin dashboard | Protected admin page at navigation | Placeholder ang counts, recent activity, security feed, alerts, global search, at notification control; hindi pa nakakabit sa live data |
| Admin user management | IT Admin can list/create GSO Staff accounts; may email verification status | Walang edit, deactivate/reactivate, role lifecycle, forced reset, o invite flow; iisang default password ang ginagamit |
| Admin audit/security | Inventory change log API at login event records sa database | Hindi pa pinagsasama ang user/account changes, login security events, at GSO request actions sa admin activity view |
| GSO dashboard | Dashboard UI at visual analytics | Naka-hardcode ang ilang KPI at distribution figures; hindi dapat ituring na live operational data |
| GSO inventory/issuance/returns/repair | May API-backed inventory, employee, issuance, return, at repair workflows | Ito ay pangunahing employee asset assignment flow; hindi pa ito general borrowing service para sa students/faculty at scheduled temporary loans |
| Requests & Borrowing | GSO page layout na may request queue at sample borrowing records | Sample data lamang; walang general borrowing request API/schema, live queue, requester form, reservation, pickup, o borrower self-service tracking |
| Requester accounts | May `IT_ADMIN` at `GSO_STAFF` roles | Wala pang requester role/profile workflow para sa student/faculty/office users |
| Home page | Public landing page at Access Dashboard button | Wala pang dedicated GSO request center; ang `/dashboard` ay hindi nakalista bilang route sa app at maaaring bumalik sa landing page |

### Mahahalagang source observations

- Ang [Admin dashboard](./frontend/src/admin/admindashboard.tsx) mismo ay nagsasabing hindi pa connected ang live admin data.
- Ang [GSO Requests & Borrowing page](./frontend/src/gso/borrowing.tsx) ay gumagamit ng `sampleRequests` at `sampleBorrowings`.
- Ang [backend issuance routes](./backend/src/modules/issuances/issuances.routes.js) at [employee routes](./backend/src/modules/employees/employees.routes.js) ay para sa GSO-managed employee issuance/return, hindi pa para sa student/faculty borrowing submissions.
- Ang [database migrations](./backend/database/migrations) ay may employee issuance batches at partial returns, ngunit wala pang dedicated GSO borrowing request/reservation model.
- Ang [user account service](./backend/src/modules/users/users.service.js) ay gumagamit ng iisang `Admin123` default password para sa bagong GSO account; dapat itong unahin bilang account-security improvement.
- Ang [GSO dashboard](./frontend/src/gso/gsodashboard.tsx) ay may hardcoded KPI at charts; dapat palitan ng live queries bago gamitin para sa operational decisions.
- Ang [app routes](./frontend/src/App.tsx) ay may protected Admin at GSO pages, ngunit wala pang requester portal route.

---

## 2. Recommended Scope: Huwag Paghaluin ang Issuance at Borrowing

Panatilihin ang dalawang magkaibang business processes:

| Process | Gamit | Halimbawa |
|---|---|---|
| Employee issuance | Pangmatagalang assignment ng asset sa employee/department | Laptop na itatalaga sa isang staff member |
| Temporary borrowing | Pansamantalang paggamit na may pickup at return schedule | Projector o sound system para sa class/event |

Maaaring mag-share ang dalawang process ng `item_catalog`, user identity, inventory movement, notifications, at audit utilities. Pero dapat magkahiwalay ang request records, statuses, dates, approvals, at reservation logic para hindi masira ang kasalukuyang employee issuance/return workflow.

### MVP scope

Unahin lamang ang:

1. Home page **GSO Request Center**.
2. Student/faculty/employee digital borrowing form.
3. GSO live review queue.
4. Availability at reservation.
5. Release, return, overdue, at condition tracking.
6. Secure **My Requests** view.
7. Admin account/security dashboard essentials.

I-hold muna ang facility, vehicle, at purchase workflows hanggang stable na ang Borrowing MVP.

---

## 3. Proposed User and Role Model

### Roles

- **IT_ADMIN** — user/account lifecycle, system configuration, security/audit monitoring.
- **GSO_STAFF** — inventory, request review, approval kung authorized, reservation, release, return, at repair follow-up.
- **REQUESTER** — student, faculty, employee, o authorized office representative na maaaring mag-submit at mag-track ng sariling requests.
- **GSO_SUPERVISOR** — optional later role para sa high-value approval, escalations, policy overrides, at incident decisions. Sa MVP, maaaring gawin muna itong explicit permission ng designated GSO Staff account.

Huwag bigyan ng GSO dashboard access ang `REQUESTER`. Ang frontend route at backend endpoint ay kailangang parehong magpatupad ng role/ownership checks.

### Requester identity

Recommended MVP:

1. Gumamit ng verified school email account.
2. Magdagdag ng requester profile fields: user type, student/employee number, department/course, year/section kung applicable, at contact number.
3. I-pre-fill ang verified profile sa request form.
4. Kung hindi pa kaya ang self-registration, magbigay muna ng controlled account enrollment o school-email verification flow.
5. Huwag gamitin ang request code lamang bilang security credential para makita ang private request o attachment.

---

## 4. IT Admin Completion Solution

### 4.1 Account security — unang priority

Palitan ang shared `Admin123` account-creation flow ng secure invitation:

1. Admin creates a GSO Staff or Requester account.
2. System creates a single-use, time-limited invitation/reset token.
3. User verifies the email and chooses their own password.
4. Token is invalidated after use or expiration.
5. Admin can resend/revoke the invitation, but cannot view the user's chosen password.

Kung kailangan pa rin ng temporary password sa local development, panatilihin itong development-only at ipilit ang password change sa first login. Huwag ipakita o i-reuse ang shared default password sa production.

### 4.2 Account lifecycle

Palawakin ang kasalukuyang list/create flow upang masuportahan ang:

- search at filter by name, email, role, verification, at active status;
- view account details at assigned role;
- edit basic profile fields;
- deactivate/reactivate account;
- revoke current sessions kapag ni-disable o nire-reset ang account;
- resend verification/invitation;
- trigger password reset without seeing the password;
- assign only approved roles; at
- show created date, last sign-in, email verification, at account status.

Gamitin ang soft deactivation sa halip na hard delete upang manatili ang audit history at request ownership. Kapag na-disable ang user, i-revoke ang existing sessions gamit ang kasalukuyang `token_version` mechanism.

### 4.3 Live Admin dashboard

Palitan ang placeholder cards ng live summary:

- total active accounts, separated by role;
- pending email verification/invitations;
- recent failed and successful sign-ins;
- recent account and role changes;
- recent inventory/request administrative actions;
- failed notification/background tasks, kapag naidagdag na ang job tracking; at
- items requiring security/admin attention.

Ang **Recent Activity** ay dapat mag-link sa filtered audit log. Ang **Security Events** ay dapat manggaling sa login event records at account status changes. Ang **System Alerts** ay dapat may source, timestamp, severity, at action/owner—hindi generic placeholder cards.

### 4.4 Audit log coverage

Panatilihin ang existing inventory audit logs at dagdagan ang coverage para sa:

- account creation, deactivation, reactivation, at role changes;
- invitation/verification reset actions;
- GSO request submission at status changes;
- approvals, rejections, revisions, at overrides;
- reservation creation/expiry/release;
- physical release and return;
- quantity and condition changes;
- attachment upload/download/delete; at
- notification/job retry or failure.

Sa bawat event, itala ang actor, event/action, target record, timestamp, reason kung kailangan, at before/after values. Hindi dapat mabura o ma-edit ng normal Admin/GSO action ang audit history.

### 4.5 Admin search and alerts

Gawing functional ang currently disabled search. Sa unang version, maghanap lamang sa:

- staff/requester accounts;
- request code;
- audit event; at
- item code.

I-limit ang resulta ayon sa role. Huwag ipakita sa global search ang private attachment contents o ibang user's personal data nang walang authorization.

---

## 5. GSO Borrowing MVP Solution

### 5.1 Home page Request Center

Magdagdag ng **Submit a GSO Request** section sa public landing page na may:

- **Borrow an Item** — MVP entry point;
- **Request a GSO Service** — later phase;
- **Report Damaged/Missing Item** — later phase o linked sa existing GSO process; at
- **Track My Request** — requester-only portal.

Ang form page ay accessible bilang requester flow, pero ang GSO queue at review actions ay protected pa rin sa `GSO_STAFF`.

### 5.2 Borrowing form

#### Requester information

- full name at verified school email;
- requester type: Student, Faculty, Employee, o Office Representative;
- student/employee number;
- course, year level, section, department, o office;
- contact number; at
- adviser/supervisor/authorized representative kung required ng policy.

#### Request details

- item/category;
- quantity;
- purpose/activity;
- venue/location;
- pickup date/time;
- expected return date/time;
- event/activity name kung applicable;
- special handling notes; at
- required approval/endorsement attachment.

#### Form automation

- pre-fill verified requester details;
- show only fields for the selected requester type;
- show only item categories that requester may request;
- show current availability before submission;
- validate dates, quantity, required attachments, and borrowing limits;
- warn about schedule conflicts or similar pending requests;
- save draft where practical; at
- return a unique request code and receipt after successful submission.

### 5.3 Eligibility and item policy

Gumamit ng configurable policy matrix. Huwag i-hardcode ang final student/faculty permissions hangga't hindi kumpirmado ng GSO.

| Policy | Example rule to configure |
|---|---|
| Requester type | Student, Faculty, Employee, Office, Organization |
| Item category | Shared equipment, IT equipment, furniture, restricted/fragile item |
| Eligibility | Which requester type may request this category |
| Quantity limit | Maximum units per request |
| Duration limit | Maximum borrowing period |
| Approval | GSO Staff only, or GSO plus adviser/supervisor |
| Attachment | Endorsement, event permit, or none |
| Extension | Allowed/blocked and maximum number |
| Release/return checklist | Accessories, condition, photo, signature requirements |

Sample rule for discussion only: standard shared items may be requested for school purposes; high-value or fragile equipment may require additional approval; external requests require manual verification. GSO must confirm the actual policy before implementation.

### 5.4 Request review and approval permissions

| Action | Requester | GSO Staff | Designated supervisor |
|---|---:|---:|---:|
| Submit request | Yes | Optional | Optional |
| View own request | Yes | Yes, within GSO access | Yes |
| View all GSO requests | No | Yes | Yes |
| Request revision | No | Yes | Yes |
| Approve standard request | No | If granted permission | Yes |
| Approve restricted/high-value item | No | Only if explicitly granted | Yes |
| Record physical release | No | Authorized staff | Authorized staff |
| Record return/inspection | No | Authorized staff | Yes |
| Approve extension | Request only | If granted permission | Yes |
| Override policy | No | No by default | Yes, with reason and audit record |

The backend must enforce these permissions; hiding a button in the frontend is not sufficient.

### 5.5 Suggested request statuses

```text
Submitted -> For Review -> (Needs Revision -> For Review)
                         -> Rejected
                         -> Approved -> Reserved -> Ready for Pickup
                                      -> Borrowed / Active
                                      -> Overdue
                                      -> Partially Returned / For Inspection
                                      -> Incident Review (if needed)
                                      -> Closed
```

Additional terminal state: `Cancelled`. A pickup that is not collected should enter `No-show Warning` before the reservation is released.

### 5.6 Availability and reservation rules

Compute requestable quantity from:

```text
Requestable quantity = on-hand quantity
                     - quantity in active borrowings
                     - overlapping confirmed reservations
                     - quantity unavailable for repair/maintenance
```

Rules:

- Do not allow `Under Maintenance`, `Unserviceable`, or `Retired` stock to be reserved.
- Check the requested time interval, not only the current inventory status.
- Use a database transaction/locking strategy so simultaneous requests cannot reserve the same last unit.
- Create a temporary hold only for a defined review window.
- Release the hold automatically on rejection, cancellation, expiration, or no-show.
- Convert a confirmed reservation to `Borrowed` only after staff records the actual physical release.
- Keep the existing employee issuance stock calculations separate until both flows are deliberately reconciled.

### 5.7 Release and return records

At release, authorized GSO Staff records:

- actual released item and quantity;
- condition out and accessories;
- actual date/time;
- releasing staff; and
- borrower acknowledgment.

At return, authorized GSO Staff records:

- quantity returned and remaining quantity;
- condition in and accessories;
- actual date/time;
- receiving staff;
- photos/remarks when necessary; and
- whether inspection or repair is required.

Partial return must leave the unreturned quantity active. Do not mark the entire quantity available when only part has been returned.

### 5.8 No-show, overdue, extension, and damage

- **No-show:** notify requester, allow a configurable grace period, then release the reservation and record the event. Repeated no-shows may require manual review; do not auto-ban on the first occurrence.
- **Due reminder:** send reminders before the due date and on the due date.
- **Overdue:** mark overdue, notify the borrower and GSO, then escalate after a configurable interval.
- **Extension:** requester submits a new return date and reason; system checks conflicts; authorized GSO approves/rejects; record every decision.
- **Damage/missing quantity:** create an incident/repair task, block affected stock, and hold closure until a human decision is recorded.
- **Closure:** close only when quantity is reconciled, inspection is complete, and there is no unresolved incident.

---

## 6. Proposed Data and API Shape

Keep this separate from `employee_issuances` so the employee long-term issuance process remains intact.

### Suggested data entities

| Entity | Purpose |
|---|---|
| `requester_profiles` | User type and school identity details |
| `gso_requests` | Request code, requester, type, purpose, status, timestamps, assigned reviewer |
| `borrowing_request_items` | Item, requested/approved quantity, and unit |
| `borrowing_reservations` | Item, quantity, schedule interval, hold expiry, reservation state |
| `borrowing_transactions` | Actual release/return events, quantity, condition, staff, date/time |
| `request_status_history` | Previous/new status, actor, reason, and time |
| `request_attachments` | Private file metadata and access owner |
| `notification_events` | Event, recipient, channel, delivery state, retry count |

Reuse existing inventory references and audit utilities where appropriate. Attachments must use private storage and authorization checks, not public file URLs.

### Example API groups

Requester-facing:

- `POST /requests/borrowings` — submit borrowing request.
- `GET /requests/mine` — list own requests.
- `GET /requests/mine/:requestId` — view own request and timeline.
- `POST /requests/mine/:requestId/revisions` — upload requested revision.
- `POST /requests/mine/:requestId/cancel` — cancel before release when policy allows.
- `POST /requests/mine/:requestId/extensions` — request an extension.

GSO-facing:

- `GET /gso/borrowings` — paginated/filterable queue.
- `GET /gso/borrowings/:requestId` — authorized detail.
- `POST /gso/borrowings/:requestId/decision` — approve, reject, or request revision with note.
- `POST /gso/borrowings/:requestId/release` — record actual release.
- `POST /gso/borrowings/:requestId/returns` — record full/partial return and condition.
- `POST /gso/borrowings/:requestId/extensions/:extensionId/decision` — decide extension.

Admin-facing:

- `GET /admin/overview` — live dashboard summary.
- `GET /admin/security-events` — login/account security events.
- `PATCH /admin/users/:userId/status` — activate/deactivate and revoke sessions.
- `POST /admin/users/:userId/invitations` — issue/resend a secure invitation.

These are proposed API shapes, not existing routes.

---

## 7. GSO and Admin Screen Completion

### GSO Requests & Borrowing screen

Replace sample data with a paginated backend queue containing:

- pending review;
- needs revision;
- approved/reserved;
- pickup today;
- active borrowings;
- due soon/overdue;
- partial returns; and
- return inspection/incident review.

Make the search, date filter, request-type filter, status tabs, selected details, and actions functional. Request details should show requester, form data, item availability, attachments (authorized only), decisions, and status timeline.

### GSO dashboard

Replace static values with database-backed counts, with a clear loading/error/empty state. Recommended MVP cards:

- items available;
- requests awaiting review;
- pickups due today;
- active borrowings;
- items due/overdue; and
- returns needing inspection.

Only label a metric as live when it comes from a current API query. Keep chart/report features secondary until the source data is reliable.

### Admin screens

- **Overview:** active accounts, unverified invitations, recent security events, recent audit activity, and actionable system alerts.
- **User Management:** create/invite, search, profile/role/status, disable/enable, resend invitation, reset access, and last sign-in.
- **Audit/Security:** filter by actor, event type, target, date, and result; show before/after details where applicable.
- **Permissions:** show who can create accounts, approve borrowing, release assets, change policies, or export records.

---

## 8. Automation Design

| Trigger | System automation | Human decision still required |
|---|---|---|
| Request submitted | Validate fields/files, make request code, route to GSO queue | Review unusual/incomplete case |
| Item and schedule selected | Calculate availability and detect conflict | Decide exception if policy allows one |
| Request approved | Confirm reservation and send pickup instructions | Approval itself |
| Pickup window approaching | Send reminder/confirmation prompt | Physical handoff |
| Release recorded | Update borrowing and inventory movement; send receipt | Staff verifies actual item/condition |
| Due date approaching | Send return reminder | Borrower returns item |
| Due date passed | Mark overdue and notify/escalate | Decide incident or policy response |
| Return recorded | Reconcile quantities and create inspection task if needed | Assess physical condition |
| Damaged return | Block affected stock and create repair/incident task | Approve repair, retirement, or resolution |
| SLA exceeded | Notify assigned owner and supervisor | Reassign or resolve workload |

Automated jobs must be safe to retry: repeated runs should not duplicate reminders, status history, or reservation releases. Record last run, result, and error for operational review.

---

## 9. Implementation Roadmap

### Phase 0 — Confirm GSO business rules

Finalize these values with the GSO before coding:

- requester types and identity requirements;
- which categories each requester may borrow;
- maximum quantity and borrowing duration;
- required attachments and approver;
- temporary reservation duration;
- pickup grace period and no-show handling;
- extension limits and conflict rule;
- overdue escalation interval;
- condition/damage/partial-return policy; and
- who is authorized to approve, release, inspect, and override.

### Phase 1 — Admin and access baseline

1. Replace shared default-password account setup with a one-time invitation/password setup flow.
2. Add controlled `REQUESTER` identity without granting staff permissions.
3. Add Admin activate/deactivate, session revocation, and invitation/reset actions.
4. Connect Admin summary to account and login event data.
5. Expand audit coverage for account and role changes.

### Phase 2 — Borrowing backend foundation

1. Add dedicated borrowing/request tables and migrations.
2. Add requester-facing and GSO-facing APIs with ownership and role checks.
3. Add transactional availability/reservation logic.
4. Add status history and private attachment metadata.
5. Keep employee issuance/return endpoints unchanged unless shared inventory rules require a deliberate integration.

### Phase 3 — End-to-end Borrowing MVP

1. Add home page GSO Request Center and borrowing form.
2. Add My Requests page.
3. Connect GSO queue and details to real request APIs.
4. Add approval, revision, reservation, release, return, and inspection actions.
5. Add email/in-app confirmations and due reminders.

### Phase 4 — Operational automation

1. Add no-show, overdue, and extension workflows.
2. Add repair/incident task generation.
3. Add Needs Attention queue and SLA escalation.
4. Replace GSO static dashboard figures with live queries.
5. Add reporting and data reconciliation.

### Phase 5 — Future GSO services

After Borrowing MVP is stable, reuse the request engine for:

1. Facility reservations.
2. School vehicle scheduling.
3. Purchase requests.
4. Broader job/service requests.

---

## 10. Definition of Done

### Admin

- Admin dashboard counts and activity are loaded from real backend data.
- User management can invite/create, search, deactivate/reactivate, and recover access safely.
- No shared default password is displayed or used for new production accounts.
- Deactivation revokes existing sessions.
- Login/account/request actions appear in authorized audit/security views.
- IT Admin cannot perform GSO physical release actions by default.

### Borrowing

- Verified requester can submit a complete request and receive a unique request code.
- Requester can view only their own requests and authorized documents.
- GSO queue displays database records, not sample arrays.
- Server validates eligibility, dates, quantity, and availability.
- Concurrent requests cannot reserve the same last available quantity.
- Approval does not claim physical release; staff records the actual handoff.
- Full and partial return update inventory correctly.
- Overdue, no-show, extension, damage, and closure decisions are traceable.
- Every approval, release, return, override, and status transition is audited.
- Failed notification delivery does not lose or duplicate the business transaction.

### Dashboard and operations

- GSO KPIs are live and explain their date/time scope.
- Empty, loading, and backend-error states are shown clearly.
- Operational queues make overdue, pending, and incident items actionable.
- Facility/vehicle/purchase workflows remain out of MVP until borrowing is stable.

---

## 11. Additional Improvements That Fit the Project

These are useful, but should follow the core Admin and Borrowing work:

1. **QR/barcode-assisted release and return** — scan asset code to reduce manual item selection.
2. **Asset-specific tracking** — if multiple units of one catalog item can have different serial numbers or conditions, track each tagged unit separately from aggregate quantity.
3. **Inventory reconciliation report** — compare catalog quantity, active issuance, active borrowing, reservations, and repair stock.
4. **Notification delivery log** — show queued/sent/failed/retried status to Admin/GSO.
5. **Exportable reports** — borrowing, overdue, returns, repair, and audit summaries in CSV/PDF.
6. **GSO service guide on home page** — rules, required documents, office hours, and expected processing time.
7. **Mobile-friendly pickup/return checklist** — make actual counter use easier for GSO Staff.

Do not prioritize automated fines, automatic blacklisting, anonymous access to private requests, or automatic high-value approvals for the MVP. Those require policy decisions and human review.

---

## Final Recommended Solution

Complete the system in this order:

1. **Secure Admin account lifecycle** — remove shared default passwords and add invite/deactivate/recovery controls.
2. **Requester identity** — add a least-privilege verified requester path for students/faculty/employees.
3. **Dedicated Borrowing workflow** — build request records separately from employee issuance.
4. **GSO operational queue** — connect review, reservation, release, return, and inspection to real APIs.
5. **Reliable automation** — reminders, overdue/no-show/extension handling, repair triggers, audit, and live dashboards.
6. **Expand later** — facility, vehicle, and purchase requests after Borrowing MVP is dependable.

Sa ganitong design, matatapos ang pinakamalaking gaps sa Admin at GSO habang napapanatili ang kasalukuyang employee issuance, inventory, return, repair, authentication, at audit foundations ng A.SSET.

