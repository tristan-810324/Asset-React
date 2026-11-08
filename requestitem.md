# Request item workflow

## Goal

Use one requester-facing item requisition flow for a Head/EmployeeHead account. The Head requests what the department needs; GSO decides whether the item is available, needs to be purchased, or needs another action.

The requester should not be required to know whether GSO has stock. Final cross-tagging happens only after the requisition is approved and the item is ready for handover.

## End-to-end flow

```text
Head submits item requisition
        ↓
GSO Head reviews and endorses
        ↓
Finance / purchasing process, when required
        ↓
GSO receives or confirms the item
        ↓
GSO Main Issuance assigns recipients and cross-tags units
        ↓
Employee receives the item
        ↓
Item is returned, repaired, transferred, or marked consumed
```

## 1. Request item: Head requisition

The signed-in Head/EmployeeHead account is automatically attached to the request.

### Required request fields

- Head/requester account and verified employee identity
- Verified department/office
- Head position
- Request date, generated automatically from the submission time
- Date needed, entered by the Head for planning
- Purpose or justification
- One or more requested item rows
- Requester certification

### Required item-row fields

- Requisition category:
  - Office supplies
  - Office equipment
  - Machineries / parts
  - Peripherals / computer parts
  - Tools and equipment
  - Electrical supplies
  - Other consumables
- Quantity
- Item description/specifications
- Planned staff recipient(s), optional during request creation
- Additional remarks, optional

The Head may identify likely recipients, but the list must not block the requisition when the final assignment is not yet known. The final recipient list is confirmed at issuance.

### Item Master Data matching

- The item-name field shows saved Item Master Data names after a category is selected.
- Selecting a saved name stores its `catalogItemId` with the requisition and pre-fills the saved description.
- Selecting `General item / not listed` opens a short free-text item name field.
- The server rechecks that the selected catalog ID, item name, and category still match before saving the request.
- The request stage does not promise that stock is available. GSO confirms stock or purchase handling after review.

## 2. GSO Head purchase queue

The purchase queue should show the requisition as submitted by the Head, including:

- Reference number
- Head/requester name, employee code, email, and position
- Verified department/office
- Request date and date needed
- Requisition category
- Quantity and specifications per item
- Planned staff recipients, when provided
- Current status and review history

The purchase queue remains responsible for review, endorsement, requests for information, rejection, and Finance handoff. It should not create final employee custody records.

Recommended statuses:

```text
Submitted
→ Under Review
→ Needs Information       (optional branch)
→ GSO Endorsed
→ Sent to Finance         (when purchase approval is required)
→ Approved / Received
→ Ready for Issuance
```

## 3. Main Issuance: final cross-tagging

When the item is physically available, GSO opens an approved requisition from Main Issuance and records the actual deployment.

### Issuance fields

- Source requisition reference number
- Head/requester and department owner
- Item name, category, and quantity
- Asset tag, serial number, or unit number when applicable
- Actual recipient employee name
- Recipient employee code
- Recipient school email
- Recipient position
- Assigned office/location
- Condition before handover
- Issue date, generated automatically at confirmation
- Issuance remarks
- Person who processed the handover

Every unit record should retain both relationships:

```text
Requested by: Head / EmployeeHead
Department owner: Head's verified department
Current custodian: Specific employee using the item
Current location: Office, room, or assigned work area
Source: Original requisition reference number
```

This keeps the Head accountable for the department request while making the actual employee and location visible for custody and return tracking.

## 4. Bulk assignment for many employees

The Main Issuance screen should support bulk assignment instead of requiring one long manual form.

Recommended interaction:

1. Select an approved requisition.
2. Show the received quantity and available unit tags.
3. Select multiple active staff under the Head's verified department.
4. Allocate quantities per employee.
5. Use one shared location when appropriate, with per-employee overrides.
6. Assign or scan unit tags in bulk.
7. Review the allocation summary.
8. Confirm the handover once.

Useful bulk actions:

- Select all staff under the verified department
- Split quantity equally
- Assign the next available unit tag
- Apply one location to all selected recipients
- Remove one recipient before confirmation
- Save as pending assignment without issuing yet

## 5. Tracking after issuance

### Per-unit assets

Examples: laptops, monitors, printers, tools, equipment, and peripherals.

Track each unit separately with its own asset tag, recipient, location, condition, issue date, return date, and custody history.

### Consumable or quantity stock

Examples: paper, toner, cables, electrical supplies, and other consumables.

Track the quantity issued and recipient/batch record. Individual asset tags are not required unless GSO chooses to tag a specific unit.

Recommended quantity statuses:

```text
Received → Ready for Issuance → Issued → Consumed
```

Recommended reusable-asset statuses:

```text
Received → Ready for Issuance → Issued → Return Requested
→ Returned / For Repair / Lost
```

## 6. Return and location visibility

When an item is returned or reported for repair, GSO should be able to see:

- Source requisition
- Head/requester
- Current and previous custodian
- Current and previous location
- Asset tag or batch reference
- Issue date
- Return date
- Condition out and condition in
- Return reason or repair notes
- Staff member who processed the return

Returning an item should close the current custody assignment but preserve the full history. The original Head requisition must remain linked to the item record.

## Product decisions

- Keep `PURCHASE_REQUISITION` as the backend workflow for Head item requests.
- Use the requester-facing `Request item` entry instead of exposing a stock-versus-purchase decision.
- Let GSO validate stock after submission.
- Make planned recipients optional at request time.
- Make actual recipient and location required before final issuance.
- Keep the Head as department owner and the assigned employee as current custodian.
- Use automatic timestamps for request submission, issuance, and return events.
