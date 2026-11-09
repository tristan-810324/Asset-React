# Purchase Requisition Flow v2

> Simplified: no Finance account, auto-detect pending requests on restock, batch fallback.

## The Full Flow

### 1. Employee submits a request
- "Kailangan ko ng 5 webcam"
- All items start as `WAITING_STAFF_REVIEW`

### 2. GSO Staff checks stock per item
- **In stock** → Staff picks:
  - **Issue now** → `READY_FOR_STAFF` → issue sa Main Issuance
  - **Ask GSO Head first** → `WAITING_GSO_HEAD`
- **Not enough stock** → **Purchase** → `WAITING_GSO_HEAD`

### 3. GSO Head decides
- **Approve** → in-stock goes back to Staff; purchase moves to the "Send to Finance" tab (`WAITING_FINANCE`, "Approved for purchase")
- **Decline** (needs reason) → `REJECTED`
- **Ask requester** → `NEEDS_INFORMATION` → reply goes back to Staff

### 4. GSO Head sends PDF to Finance (email)
- The Head clicks **Send PDF to Finance**; A.S.SET emails the PDF to Finance
- Line status: `WAITING_FOR_PURCHASE`; request status: `Sent to Finance`
- GSO Staff get a notification that they can buy the items now
- Head's system work is done (there is no Finance reply to record)

### 5. Finance gives money (outside the app)
- No account, no system interaction

### 6. GSO Staff buys and restocks in Item Master Data
- Adds or restocks the item (or raises its quantity when editing it)
- On save, the system checks: "May naghihintay ba ng item na ito?"

### 7a. Smart Restock Popup (primary path)
- System detects pending purchase lines that match the restocked item (same name + category)
- Shows a popup:

```
┌─────────────────────────────────────────────────┐
│  3 requests waiting for Webcam                  │
│                                                 │
│  ☑ REQ-045 · Juan dela Cruz     · 5 pcs        │
│  ☑ REQ-051 · Maria Santos       · 3 pcs        │
│  ☑ REQ-067 · Pedro Reyes        · 4 pcs        │
│                                                 │
│  Total: 12 pcs  (you restocked: 50)             │
│                                                 │
│  Receipt / invoice no: [OR-004512        ]      │
│                        (optional)               │
│                                                 │
│  [Fulfill selected]              [Skip for now] │
└─────────────────────────────────────────────────┘
```

- Staff can check/uncheck individual requests
- One receipt covers all selected
- "Fulfill selected" → all checked lines become `READY_FOR_STAFF`
- "Skip for now" → nothing happens, requests stay as `WAITING_FOR_PURCHASE`

### 7b. Batch Receive (fallback / later)
- Staff opens **Purchase Requisitions** page
- A tab shows all `WAITING_FOR_PURCHASE` items where Item Master Data already has enough stock
- Same checklist UI — select all or pick, enter receipt, one click

```
┌─────────────────────────────────────────────────┐
│  Ready to link (3)                              │
│                                                 │
│  ☑ REQ-045 · Webcam × 5    · stock: 50  ✓      │
│  ☑ REQ-051 · Webcam × 3    · stock: 50  ✓      │
│  ☑ REQ-067 · Webcam × 4    · stock: 50  ✓      │
│                                                 │
│  Receipt / invoice no: [OR-004512        ]      │
│                                                 │
│  [Record all deliveries]                        │
└─────────────────────────────────────────────────┘
```

### 8. GSO Staff issues in Main Issuance
- Hands item to the employee
- `ISSUED` — done!

---

## Statuses

| Status | Meaning |
|--------|---------|
| `WAITING_STAFF_REVIEW` | Staff hasn't looked yet |
| `READY_FOR_STAFF` | Ready to issue (in stock, or delivery linked) |
| `WAITING_GSO_HEAD` | Head needs to decide |
| `NEEDS_INFORMATION` | Waiting for requester reply |
| `WAITING_FINANCE` | Head approved the purchase; the PDF is not sent yet ("Send to Finance" tab) |
| `WAITING_FOR_PURCHASE` | Head sent to Finance, Staff will buy |
| `PARTIAL_STOCK` | Some reserved, rest needs purchase |
| `PARTIALLY_ISSUED` | Some reserved units already handed over |
| `HANDOVER_PENDING` | Being issued right now |
| `ISSUED` | Done |
| `REJECTED` | Declined |
| `CANCELLED` | Cancelled |

### Removed from current code
- `FINANCE_SENT` → merged into `WAITING_FOR_PURCHASE`
- `FINANCE_RESPONSE` → removed entirely
- Request status `Finance Response Recorded` → removed entirely (no Finance reply)
- `WAITING_FINANCE` stays, but only means "approved, PDF not sent yet"

---

## What changes from current code

| Area | Current | v2 |
|------|---------|-----|
| Finance statuses | 3 steps (WAITING_FINANCE → SENT → RESPONSE) | Approved (`WAITING_FINANCE`) → sent (`WAITING_FOR_PURCHASE`); no reply step |
| Finance reply | Required before receive | Removed |
| Receive (link delivery) | Manual, one request at a time | Smart popup on restock + batch fallback |
| Item Master Data restock | Just adds stock, nothing else | Detects pending requests, offers to fulfill |
| Receipt/invoice | Per request | Per batch (one receipt covers multiple requests) |

---

## Two chances to link — nothing gets lost

```
Restock in Item Master Data
    │
    ├─→ Popup: "3 requests waiting!" → [Fulfill] → Done ✓
    │                                → [Skip]
    │                                     │
    └─────────────────────────────────────┘
                                          │
                              Purchase Requisitions page
                              "Ready to link" tab → [Record all] → Done ✓
```

---

## Edge Cases & Safeguards

### 1. Stock race condition — multiple requests, not enough stock

**Scenario:** Juan needs 5 webcams, Maria needs 3. Staff restocks 6. Both appear in the popup — but 6 < 8.

**Safeguard:** Real-time running total in the popup. As Staff checks/unchecks requests, the system computes remaining stock live:

```
┌─────────────────────────────────────────────────┐
│  2 requests waiting for Webcam                  │
│                                                 │
│  ☑ REQ-045 · Juan dela Cruz     · 5 pcs        │
│  ☐ REQ-051 · Maria Santos       · 3 pcs        │
│                                                 │
│  Selected: 5 / 6 available                      │
│  ⚠ Not enough stock for all (need 8, have 6)   │
│                                                 │
│  [Fulfill selected]              [Skip for now] │
└─────────────────────────────────────────────────┘
```

- Requests are sorted by date (oldest first) — first come, first served
- Staff can override: uncheck Juan, check Maria instead
- The server double-checks stock before saving — if someone else took stock in between, it rejects with a clear message

### 2. Restock not for a requisition

**Scenario:** Staff restocks 20 webcams for general inventory, not for any request. The popup still appears.

**Safeguard:** The "Skip for now" button. The popup is an offer, never forced. Staff clicks skip and the stock stays in inventory untouched. No requests are affected.

### 3. Item name mismatch between request and inventory

**Scenario:** Request says "Webcam" but Staff entered "USB Webcam 1080p" in Item Master Data.

**Safeguard:** Matching uses **category + item name**. The popup and batch tab both show both names side by side so Staff can verify:

```
│  Request item: Webcam                           │
│  Inventory item: USB Webcam 1080p               │
│  Category: Computer Parts/ Peripherals ✓        │
│                                                 │
│  ⚠ Names don't match exactly.                  │
│    Is this the same item? [Yes, link it] [No]   │
```

- Exact name match → auto-included, no extra confirmation
- Same category, similar name (one name contains all the words of the other, like "Webcam" and "USB Webcam 1080p") → shown with a warning, Staff confirms; the confirmation is written in the request history
- Same category, unrelated name ("Webcam" and "Keyboard") → not offered
- Different category → not shown at all

### 4. Partial delivery — only some units arrived

**Scenario:** Ordered 10 webcams, only 6 arrived. Juan needs 5, Maria needs 3.

**Safeguard:** Staff restocks only what actually arrived (6). The popup shows:

```
│  ☑ REQ-045 · Juan dela Cruz     · 5 pcs        │
│  ☐ REQ-051 · Maria Santos       · 3 pcs        │
│                                                 │
│  Selected: 5 / 6 available                      │
│  ℹ Maria's request stays as "Waiting for        │
│    purchase" until the next restock.             │
```

- Staff fulfills what they can now
- Remaining requests stay as `WAITING_FOR_PURCHASE`
- A request can also take part of the stock ("Only 3 of 4 in stock. Check it to link that part"): the linked part is ready to issue (`PARTIAL_STOCK`), the rest waits
- When the rest arrives and Staff restocks again → popup appears again for the unfulfilled ones
- Each restock can have its own receipt/invoice number

### 5. One receipt for multiple requests

**Scenario:** Staff bought webcams and printers in one purchase order. One receipt "OR-004512" covers everything.

**Safeguard:** This is fine and expected. The receipt number is stored per receive record, so:

- All 3 webcam requests get receipt "OR-004512"
- The printer requests also get "OR-004512"
- In audit/history, each request shows which receipt it came from
- If a different batch has a different receipt, that's a separate restock with its own popup

### 6. Staff accidentally fulfills the wrong request

**Scenario:** Staff checks Juan's request by mistake, clicks fulfill.

**Safeguard:**
- Confirmation dialog before fulfilling: "You are about to record delivery for 3 requests (12 pcs total). Continue?"
- If a mistake was made, the item hasn't been issued yet — it's only `READY_FOR_STAFF`. Staff can undo the link before issuance (unlink button on the requisition page)
- Once issued in Main Issuance, it's final — but that's a separate deliberate action

### 7. Multiple Staff working at the same time

**Scenario:** Two Staff members both see the popup for the same requests.

**Safeguard:** The server validates stock and request status at save time:
- First Staff to click "Fulfill" wins — stock is reserved, lines become `READY_FOR_STAFF`
- Second Staff gets an error: "These requests have already been fulfilled" or "Not enough stock" if the first took the units
- The popup and batch tab always fetch fresh data before showing

---

## Summary: Why this flow is complete

| Risk | Covered by |
|------|-----------|
| Not enough stock for all requests | Live running total + server validation |
| Restock not for a requisition | "Skip for now" — popup is optional |
| Item name mismatch | Category match + side-by-side names + Staff confirmation |
| Partial delivery | Fulfill what's available, rest waits for next restock |
| Audit trail for receipts | Receipt stored per receive record, shared across batch |
| Accidental fulfillment | Confirmation dialog + undo before issuance |
| Concurrent Staff actions | Server-side stock check + status lock at save time |
| Missed popup | Batch Receive tab on Purchase Requisitions page as fallback |

---

## Built (2026-11-10)

**Before running the new code, apply `backend/database/migrations/018_purchase_delivery_without_finance_reply.sql`.**
The request pages read the new undo columns, so they fail until 018 is applied. What 018 does to existing data:

- `FINANCE_SENT` / `FINANCE_RESPONSE` items → `WAITING_FOR_PURCHASE`
- Requests Finance had approved (`Finance Response Recorded` + Approved) → `Sent to Finance`, so Staff can link deliveries
- Requests Finance had rejected or sent back → `GSO Endorsed` (Head's "Send to Finance" tab), with a history note
- Adds `voided_at` / `voided_by_user_id` to `purchase_requisition_line_receipts` (undo keeps the record)

Labels in the app:

| Spec | In the app |
|------|------------|
| Smart Restock Popup | Pop-up "N requests waiting for X" in Item Master Data, after Save item |
| Fulfill selected | **Link selected deliveries** → confirm **Yes, record delivery** |
| Skip for now | **Skip for now** (or Close / Esc) |
| Batch Receive tab | Purchase Requisitions → **Ready to link** (counts items, not requests) |
| Unlink button | **Undo** on each delivery record → **Yes, undo** / **Keep it** |

API (GSO Staff): `GET /requests/purchase-requisitions/awaiting-delivery[?itemIds=1,2]`,
`POST /requests/purchase-requisitions/deliveries`, `POST /requests/purchase-requisitions/:id/deliveries/:receiptId/undo`.
The Finance reply endpoint (`POST .../:id/finance-response`) is removed.

Tests: `backend/tests/requisition-routing.test.js` covers the whole path, the batch and partial links, two staff racing,
the similar-name confirmation, and undo.
