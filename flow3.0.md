# A.S.SET Purchase, Issuance, and Return Flow 3.0

## Purpose

This document records the agreed working flow for purchase requisitions, assigning individually tagged assets, and returning those assets. It also tracks which parts are already implemented and which remain future work.

Repair and maintenance handling is outside the scope of this version.

## Agreed user roles

- **EmployeeHead (requester):** submits purchase requisitions and asset allocation requests for their department; is the accountable custodian for assets assigned under their department.
- **GSO Head:** uses a dedicated GSO Head dashboard to review and endorse purchase requisitions, send them to Finance outside the application, record Finance's response, and confirm returns for assets under their accountability.
- **GSO Staff:** uses a separate GSO Staff dashboard to receive purchased items at the GSO office, record them in inventory, label per-unit assets, issue them, and physically handle and scan returned units.
- **IT Staff:** included in the agreed user set. This document does not define IT Staff-specific actions or permissions; keep that role available for later work without assuming its purpose.
- **Assigned staff member:** the employee who actually uses an asset. In this flow, this is an employee record linked to the assignment; they do not need an application account because GSO Staff handles return scanning.

GSO Head and GSO Staff are separate account roles with separate dashboards and permissions. A GSO Head account must not be routed into or treated as a GSO Staff account.

The current GSO Head entry point is `/gso-head`; the GSO Staff dashboard remains `/gso`. The GSO Head page uses the GSO dashboard visual style while keeping a separate navigation and role boundary. Its component is [gsoheaddashboard.tsx](frontend/src/gsohead/gsoheaddashboard.tsx), with the purchase requisition queue in [purchasequeue.tsx](frontend/src/gsohead/purchasequeue.tsx).

## 1. Purchase requisition

1. EmployeeHead submits a purchase requisition to the GSO Head. The request describes the general item, quantity, purpose, specifications, department, and one or more intended staff recipients per item. The intended recipients are planning information, not a final custody assignment. It is a purchase request, not an issuance of an existing inventory unit.
2. The GSO Head reviews the form in their own account. They can request corrections or endorse the requisition. The authenticated endorsement records the GSO Head account and time; the submitted form data remains attached to the request.
3. Once endorsed, the GSO Head sends the requisition to Finance. The current implementation sends an email to the address entered by the GSO Head. Finance has no application dashboard.
4. Record the handoff recipient, time, and email message reference. When Finance replies by email or paper, the GSO Head records the decision and notes received. Do not mark a requisition as Finance-approved until that response is received and recorded.
5. AI assistance may later suggest missing details, clearer specifications, possible inventory matches, or duplicate requests. AI must not approve, reject, or sign the requisition.

Purchase requisition statuses in the current implementation:

`Submitted` → `Under Review` → `Needs Information` (requester replies, returning it to `Submitted`), `Rejected`, or `GSO Endorsed` → `Finance Handoff Pending` / `Finance Handoff Failed` → `Sent to Finance` → `Finance Response Recorded`

The GSO Head enters the Finance email recipient when sending. Finance's response can be recorded as approved, needs changes, or rejected; its decision, reference, notes, and the GSO Head account and time that recorded it are attached to the requisition. A failed Finance email remains retryable and is not marked sent. `Partially Received` and `Received` are future receiving statuses and are not part of the current request queue.

## 2. Receiving and asset registration

1. After Finance's process and purchase, the item is delivered to the GSO office.
2. GSO Staff records the actual receipt and links it to the purchase requisition. Record the item, received quantity, receipt date, supplier or delivery reference, and observed condition or discrepancy.
3. For individually tracked assets, create a separate unit record and unique barcode tag for every physical unit. Link each received unit to its purchase requisition and inventory item.
4. Do not make an unreceived unit available for issuance. Partial deliveries remain partial; only the received quantity is registered as received.

## 3. Allocation and issuance

Purchase requisition and asset allocation are separate records. One purchase may result in multiple units assigned to different staff members or locations.

1. After the item is received, EmployeeHead submits an allocation request for their department. It identifies the assigned staff member, intended deployment location, purpose, and relevant purchase requisition when applicable.
2. GSO Staff reviews the allocation request, scans the exact available unit tag, and links that unit to the request.
3. The assignment records:
   - **Accountable custodian:** EmployeeHead
   - **Assigned user:** the staff member who will use the unit
   - **Department**
   - **Deployment location:** where the unit will be used or installed
   - **Purchase requisition and allocation request references**
   - Issue date and condition
4. Keep the unit tag stable. The barcode identifies the physical unit; the application retrieves the current head, department, assigned user, and location from the active assignment. Do not encode changing personal or location details into the barcode itself.
5. Record who physically received the unit and who accepted accountability. If a separate handover confirmation is required, the GSO Staff member who prepared the issuance cannot also confirm it; the EmployeeHead or a different authorized GSO Staff member confirms.

## 4. Return of an individually tagged asset

GSO Staff handles the return intake and scans the barcode. The staff member who used the item may bring it back but does not need to scan or operate the application.

1. The user returns the physical unit to GSO Staff.
2. GSO Staff scans the unit tag. The application displays the active assignment: EmployeeHead/custodian, department, assigned user, deployment location, and purchase/issuance reference.
3. GSO Staff records who physically returned the unit, the return reason, condition, date/time, and the location where GSO received it.
4. The EmployeeHead confirms the return for the unit under their accountability. Bind the confirmation to that specific unit and return event.
5. Once the head has confirmed and GSO Staff has recorded physical receipt, close the active assignment and update the unit's location to the GSO return/holding area. Keep it unavailable for issuance while assessment is pending.
6. If the scanned tag does not match the active head, department, assigned user, or deployment location, flag the return for GSO verification. Do not silently close or reassign it.

Keep these locations distinct:

- **Deployment location:** where the asset was used while assigned.
- **Return location:** where GSO Staff physically received the asset, such as GSO storage or a return holding area.

Suggested return statuses:

`Active Assignment` → `Received by GSO — Awaiting Head Confirmation` → `Head Confirmed` → `Assignment Closed — Assessment Pending`

Repair and maintenance outcomes will be designed separately.

## Process boundaries

- Finance is an external party in this flow; the application records the handoff and any Finance response supplied to GSO.
- GSO Head endorsement is distinct from Finance approval.
- Purchase approval does not itself issue an asset to a staff member.
- Only individually tagged units use this cross-checked return flow; bulk quantity returns are excluded.
- The head, department, assigned user, and deployment location come from the active server-side assignment, not from values trusted from the scanner screen.
- IT Staff remains an agreed user role; its workflow and permissions are intentionally left for later definition.

## Current implementation note

The requester portal now presents borrowing and one unified department item request path. The EmployeeHead item form matches a selected item name and category to an Item Master Data record when available, while still allowing a general item name when it is not listed. It collects quantities, purpose, needed date, and optional planned recipients from the verified department directory; requester identity and department come from the GSO-verified employee record, and submission requires a certification checkbox. The intended staff list is included in the GSO Head review queue and Finance email, while final per-unit custody is still recorded after receipt. The GSO Head dashboard has its own role-protected purchase queue, review/endorsement actions, Finance email handoff, and Finance-response recording. Status emails to the requester are attempted after GSO Head decisions and Finance updates. The GSO Staff request inbox excludes purchase requisitions.

The EmployeeHead dashboard shows three summary counts, recent requests with their intended staff, and recent department returns with the assigned employee and recorded returner. Department return history is matched against employee records in the verified department.

Email sending requires the app's SMTP configuration. The GSO Head enters the Finance recipient in the queue. If a requester status email cannot be delivered, the GSO Head sees a warning; there is no in-app retry control for that requester email yet. The schema additions in [013_purchase_requisition_finance_handoff.sql](backend/database/migrations/013_purchase_requisition_finance_handoff.sql) must be applied before using the new Finance fields and statuses.

Relevant current files are [requestitem.tsx](frontend/src/requesters/requestitem.tsx), [requestcenter.tsx](frontend/src/requesters/requestcenter.tsx), [gsoheaddashboard.tsx](frontend/src/gsohead/gsoheaddashboard.tsx), [purchasequeue.tsx](frontend/src/gsohead/purchasequeue.tsx), and [requests.service.js](backend/src/modules/requests/requests.service.js). Receiving, per-unit asset registration, allocation, and the barcode-based returns process are described above but remain later implementation steps.
