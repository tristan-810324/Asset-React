# Job / Service Request

One requester form for facility and computer lab jobs. The server decides which team receives the job from the category. GSO Staff work GSO jobs. IT Staff and IT Admin work ITSS (computer lab and technical) jobs.

Status: built and tested on localhost, not yet committed to git. See "Status and open decisions" at the end.

## Who does what

| Role | Does |
| --- | --- |
| Requester (BORROWER) | Submits the job, follows its progress, confirms or reopens it after completion |
| GSO Staff (`GSO_STAFF`) | Works GSO jobs on the Service Workboard |
| IT Staff (`IT_STAFF`) and IT Admin (`IT_ADMIN`) | Work ITSS jobs on the IT Support Queue |

GSO Head is not part of this flow.

## Requester form

| Field | Required | Notes |
| --- | --- | --- |
| Service category | Yes | Picked from the list below. Decides the team. |
| Target date | Yes | Cannot be in the past. |
| Department / office | Yes | |
| Location | Yes | Building and room. |
| What needs attention? | Yes | Describe the problem or work. |
| Description of the service | Only for "Others" | Up to 200 characters. |
| Remarks | No | |

The old "Particulars / nature of work" task list is removed from the requester form. Work items are optional, and staff track the job itself.

## Routing by category

The server decides the team. The team and priority sent by the browser are ignored.

**GSO**
- Electrical & Lighting
- Plumbing & Water
- Furniture & Carpentry
- Classroom / Building Repair
- Cleaning & Sanitation
- Event Setup & Moving
- Safety Hazard
- Other General Service
- Others (the requester describes the service; GSO can reroute it)

**ITSS**
- Computer Device
- Network & Connectivity
- Software & Access
- Peripherals & Printing

Source: `backend/src/modules/requests/service-work-order.constants.js`.

## Priority

Calculated from the target date, using the Manila date, when the job is read.

- **Urgent:** category is Safety Hazard, or the target date is today or tomorrow.
- **High:** the target date is within 3 days.
- **Standard:** everything else.

## Job lifecycle

1. **New:** the job appears in the team's New Jobs queue, unclaimed.
2. **Claim:** a staff member takes the job. The status stays Submitted, shown as "Claimed".
3. **Start work:** the job moves to In progress. Optional start note.
4. **Forward:** before work starts, the job can be sent to the other team (for example, ITSS to GSO). It becomes a new unclaimed job in that queue, and the transfer stays in the history. Not allowed once work has started.
5. **Reject:** before work starts, with a required reason. The requester is told the reason.
6. **Take over:** a staff member of the same team takes a claimed job, with a required reason.
7. **Complete:** the team marks the job completed with a completion note and an optional task checklist. The status becomes "Awaiting Requester Confirmation".
8. **Requester confirms or reopens:**
   - "Yes, issue resolved" closes the job.
   - "No, issue remains" sends the job back to the same team with a message. The reopen count goes up.
9. **Auto-close:** if the requester does not answer within 2 days after completion, the job closes automatically. The requester gets one reminder about a day before that.

Staff cannot close a completed job by hand. A completed job closes only when the requester confirms it or when the 2-day auto-close runs.

The API also has `review` and `need-info` actions, but the Service Workboard has no buttons for them.

## Notifications

- New job: the team's staff.
- Forwarded job: the other team.
- Requester cancels: the team.
- Requester replies: the team.
- Job completed: the requester, asking for confirmation within 2 days.
- Job rejected: the requester, with the reason.
- Auto-closed: the requester.
- Reminder before auto-close: the requester, once.
- Requester submits: the requester's bell shows "Request submitted" (all request types).

Email is skipped when SMTP is not set.

## Automation

Runs from `backend/index.js` (every minute) and from the expiry sweep middleware. It auto-closes overdue completed jobs, sends the requester reminders, and sends team deadline reminders.

## Where it lives

**Backend**
- `src/modules/requests/requests.validation.js`: the JOB_REQUEST block (form rules).
- `src/modules/requests/service-work-order.constants.js`: categories, teams, priority rules.
- `src/modules/requests/service-work-orders.validation.js`, `.repository.js`, `.service.js`, `.controller.js`: the workflow.
- `src/modules/requests/requests.routes.js` and `requests.controller.js`: routes.
- `src/modules/requests/requests.service.js` and `requests.repository.js`: submit, cancel, reply, confirm, reopen, and the work order created with each job.
- `index.js` and `src/middleware/expiry-sweep.middleware.js`: automation.
- Tables `service_work_orders` and `service_work_order_tasks` are in migration `004_requests_and_audit.sql`.

**Routes**
- Requester: `POST /requests/mine/:id/confirm-service`, `POST /requests/mine/:id/reopen-service`.
- Team: `GET /requests/service-work-orders`, `GET /requests/service-work-orders/:id`, `POST /requests/service-work-orders/:id/:action` where action is `claim`, `review`, `need-info`, `forward`, `start`, `complete`, `takeover`, or `reject`.
- Pages: `/gso/service-workboard` (GSO_STAFF), `/itss/service-workboard` (IT_STAFF and IT_ADMIN), `/admin/support-queue` (IT_ADMIN).

**Frontend**
- Requester: `requesters/requestitem.tsx` (form), `requesters/requestdetail.tsx` (progress, confirm and reopen), `requesters/myrequests.tsx`, `requesters/serviceWorkflow.ts`, `requesters/requesterApi.ts`.
- GSO: `gso/serviceworkboard.tsx`, `gso/serviceWorkboardApi.ts`, `gso/gsodashboard.tsx`, `gso/requesterinbox.tsx`.
- IT Staff and IT Admin: `itstaff/itsssupportqueue.tsx`, `itstaff/computerlabsupport.tsx`, `itstaff/itstaffdashboard.tsx`, `components/navbars/itssnavbar.tsx`, `admin/supportqueue.tsx`, `admin/admindashboard.tsx`.

**Tests**
- `backend/tests/service-work-orders.test.js`: 20 tests.

## Status and open decisions

**Checked on 2026-11-15**
- The 20 work-order tests pass against a throwaway PostgreSQL database.
- The rest of the backend suite: 108 of 127 pass. The 19 failures are in inventory, returns, issuance, and purchase requisition tests. None refer to job or service code. A baseline run was not done to confirm they were already failing before this work.
- TypeScript and ESLint pass on the touched frontend files.
- Not yet checked: a full run in the browser for each role, and `vite build`.

**Decisions not yet confirmed by the user**
- The category-to-team mapping above.
- Priority thresholds: 1 day for Urgent, 3 days for High.
- Reject needs a reason. Reopen has no limit, and the count is stored.
- Auto-close after 2 days.
- Others goes to GSO.
- IT Admin can work ITSS jobs.

**Known gaps**
- Job requests submitted with the old form have no service category, so they cannot be routed to a team. The local database has one such request: REQ-2026-00004, Closed.
- The old JOB_REQUEST status transitions remain in `requests.service.js`. They are not used, because the generic status endpoint refuses job requests.
- Migration 004 has the work-order tables. The database must be migrated before the job workflow works.
