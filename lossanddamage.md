# Loss & Damage Cases — Agreed Feature Plan

## Purpose

Add a dedicated **Loss & Damage Cases** workspace to A.S.SET.

Requesters already submit a **Loss / Damage Report**. This feature gives GSO Staff a clear, secure way to review that report, decide what should happen to the affected item, and—only when needed—send the requester to a **PayMongo Test** checkout link.

This document is the agreed scope before implementation begins.

## Core Rules

- The implementation is **test-only**. It must never use a live PayMongo key or collect real money.
- There is **no human signature, e-signature, printed settlement form, GSO Head approval step, or Finance account** in A.S.SET.
- GSO Staff is the only in-app reviewer. They choose the resolution and enter the amount when a test payment is needed.
- PayMongo is the only payment confirmer. A browser success page must never mark a case as paid.
- The backend accepts payment confirmation only through a verified PayMongo webhook.
- Existing facility-return damage tracking remains separate. Do not repurpose or change [027_facility_return_damage_count.sql](./backend/database/migrations/027_facility_return_damage_count.sql).
- No manual receipt upload is part of this MVP.

## People and Responsibilities

| Actor | Responsibility |
| --- | --- |
| Requester | Submits the incident report and uses the test checkout only if GSO selects Payment required. |
| GSO Staff | Reviews the case, selects a resolution, enters a payment amount/reason when applicable, and closes the case after physical handling. |
| A.S.SET | Stores the case workflow, creates a test payment link, shows statuses, writes history/audit entries, and sends notifications. |
| PayMongo Test | Hosts the simulated checkout and sends the verified payment confirmation webhook. |

Finance does not need an account or any screen in the system for this test-only workflow.

## End-to-End Case Flow

```text
Requester submits Loss / Damage Report
                |
                v
GSO Staff opens Loss & Damage Cases
                |
                v
GSO Staff reviews report and selected issued items
                |
                v
Select resolution
  |-- No charge --------------------------> Closed
  |-- For repair -------------------------> GSO handles repair ------> Closed
  '-- Payment required
          |
          v
    GSO enters PHP amount and reason
          |
          v
    System creates PayMongo TEST payment link
          |
          v
    Requester selects Pay now
          |
          v
    PayMongo Test checkout succeeds
          |
          v
    Signed PayMongo webhook reaches A.S.SET
          |
          v
    Payment Confirmed automatically
          |
          v
    GSO closes the case after required physical handling
```

### Status Flow

#### No charge

```text
Submitted -> Under Review -> Closed
```

#### For repair

```text
Submitted -> Under Review -> For Repair -> Closed
```

#### Payment required

```text
Submitted -> Under Review -> Awaiting Payment -> Payment Confirmed -> Closed
```

For a **lost** item, GSO can close the case after `Payment Confirmed`.

For a **damaged** item, GSO handles repair, disposal, or other physical follow-up before closing the case.

## GSO Staff Experience

### Navigation

Add this item to the GSO sidebar, directly after **Returns & Histories** and before **Repair & Maintenance**:

```text
Returns & Histories
Loss & Damage Cases
Repair & Maintenance
```

### Case Queues

The page should have easy-to-scan queue tabs or filters:

- New Reports
- Under Review
- Awaiting Payment
- Payment Confirmed
- For Repair
- Closed

### Case Detail View

Each case should show:

- Request reference number and submitted time
- Requester name and email
- Incident type: Lost or Damaged
- Incident date and location
- Reported/responsible person
- Affected issued item(s), asset code/tag, quantity, and requester remarks
- Case history
- Current resolution and payment status, if one exists

### GSO Actions

1. **Start review**
2. Choose exactly one resolution:
   - **No charge**
   - **For repair**
   - **Payment required**
3. Enter a reason for the decision.
4. For `Payment required`, enter the PHP amount and click **Create test payment link**.
5. After PayMongo confirms a test payment, verify any needed physical item action and click **Close case**.

The payment amount field must appear only for `Payment required`.

## Requester Experience

The requester does not need a new sidebar page. The payment experience belongs in the existing request-detail page.

### Before GSO Review

The requester sees that the report is `Submitted` or `Under Review`.

### No Charge or For Repair

The requester sees GSO's decision and the next step, with no payment action.

### Awaiting Payment

Show a clear payment panel containing:

- PHP amount
- GSO's reason
- `Awaiting Payment` status badge
- **Pay now** button
- Test-mode notice: **No real money will be charged.**

The Pay now button opens the PayMongo-hosted test checkout in a new tab/window. It must only appear when a valid checkout URL exists.

### Payment Confirmed

Show:

- `Payment Confirmed` status badge
- Confirmation date/time
- Clear message that PayMongo verified the test payment automatically

## Payment Automation Rules

### What Is Automated

- Generation of a one-case, one-payment test link
- Requester notification that a payment link is ready
- Hosted PayMongo test checkout
- Signed webhook verification
- Payment status update
- GSO/requester notification after payment confirmation
- Audit/history record
- Duplicate-webhook protection

### What Is Not Automated

- GSO's assessment of responsibility or amount
- Physical inspection, repair, disposal, or closure of damaged property
- Live collection of money
- Finance reconciliation

## PayMongo Test Setup

### Required Backend Secrets

Only these values are needed:

```env
PAYMONGO_SECRET_KEY=sk_test_...
PAYMONGO_WEBHOOK_SECRET=...
```

Rules:

- Use only `sk_test_...`; never use `sk_live_...`.
- The `pk_test_...` public key is not needed because the app uses a PayMongo-hosted Payment Link, not a custom card form.
- Never put a secret in frontend code, a `VITE_*` environment variable, Git, screenshots, or this document.
- The webhook secret is a separate value created after registering a PayMongo Test webhook.
- If a test secret is exposed, regenerate it in the PayMongo dashboard before use.

### Webhook

When a public test URL is available, register a PayMongo Test webhook such as:

```text
https://your-backend-domain/api/v1/loss-damage/webhooks/paymongo
```

Subscribe to:

```text
link.payment.paid
```

The endpoint must:

- Receive raw JSON before normal JSON parsing changes it.
- Verify the PayMongo signature using the webhook secret.
- Verify that the webhook is in test mode.
- Match the payment link, amount, and PHP currency to the pending settlement.
- Record a webhook event ID so duplicate deliveries do not double-settle a case.
- Never trust the browser's return/success page as proof of payment.

### Safe Test Payment

Use PayMongo Test mode and a documented test-card flow only. No real money should move. Do not scan a QR Ph test QR; PayMongo notes that it can result in a real transaction.

Official reference: [PayMongo test mode documentation](https://docs.paymongo.com/docs/payment-acceptance-testing).

## Database Plan

Create a new migration after the existing current migrations. The feature must not alter the meaning of migration 027.

### `loss_damage_settlements`

One optional settlement record per Loss / Damage request.

Suggested fields:

- Settlement ID
- Request ID
- Resolution: `NO_CHARGE`, `FOR_REPAIR`, or `PAYMENT_REQUIRED`
- Assessment reason
- Amount in integer centavos
- Currency (`PHP`)
- Settlement status: `NO_CHARGE`, `FOR_REPAIR`, `PENDING_LINK`, `AWAITING_PAYMENT`, or `PAID`
- GSO Staff assessor and assessment time
- PayMongo test link ID and URL
- PayMongo payment ID
- Paid time

### `paymongo_webhook_events`

Store only safe delivery data:

- Provider event ID, unique
- Event type
- Settlement ID
- Payload hash, not full personal/payment payload
- Processing outcome
- Received and processed timestamps

## Backend Plan

### New API Capabilities

- List GSO Loss & Damage Cases
- View one GSO case
- Submit GSO review/resolution
- Create a PayMongo Test payment link
- Close an eligible case
- Let the requester read only their own safe payment status/link
- Receive a public PayMongo webhook without JWT authentication

### Security Requirements

- GSO-only routes require `GSO_STAFF`.
- Requesters can view only their own case/payment information.
- Webhook route is public but accepts only valid PayMongo-signed raw requests.
- Invalid, expired, replayed, duplicate, wrong-amount, wrong-currency, wrong-link, and live-mode events must not settle a case.
- The backend must gracefully show a setup-required state when test keys are absent.

### Notifications and History

Create notifications for:

- GSO: new submitted Loss / Damage report
- Requester: GSO started review
- Requester: no-charge / repair / payment-required decision
- Requester: test payment link available
- Requester and GSO: test payment confirmed
- Requester: case closed

## Local Development Plan

### Local Link Creation

```text
React localhost -> Express localhost -> PayMongo Test API
```

The app can create and open a test payment link locally as long as the backend has the test secret.

### Local Full Automation

PayMongo cannot deliver a webhook to `localhost`. For end-to-end local testing, use a temporary public HTTPS tunnel:

```text
PayMongo Test -> HTTPS tunnel -> localhost backend -> Neon development database
```

Register the temporary tunnel URL as the PayMongo Test webhook URL. Update it when the tunnel URL changes.

## Vercel + Neon Test Deployment Plan

1. Deploy a staging/test backend to Vercel.
2. Add the two test-only secrets to the **backend** Vercel project as secrets.
3. Use a stable public Vercel test URL for the PayMongo Test webhook.
4. Point the backend at the appropriate Neon development/staging database.
5. Register the staging URL in PayMongo Test mode.
6. Run the same end-to-end test used locally.

Use a pooled Neon URL for ordinary Vercel runtime traffic and a direct Neon URL only for migrations.

## Verification Checklist

- [ ] A requester can submit a valid Loss / Damage Report.
- [ ] GSO sees it under New Reports.
- [ ] GSO can choose No charge and the case closes.
- [ ] GSO can choose For repair and later close it.
- [ ] GSO can choose Payment required only with a valid PHP amount and reason.
- [ ] No payment link can be created without PayMongo test setup.
- [ ] A valid test link opens safely for the requester.
- [ ] A PayMongo test-card success sends `link.payment.paid`.
- [ ] The signed valid webhook changes the state to Payment Confirmed exactly once.
- [ ] A duplicate webhook changes nothing after the first processing.
- [ ] A fake, unsigned, expired, live-mode, wrong-link, wrong-amount, or wrong-currency webhook is rejected.
- [ ] The browser success page alone cannot mark a case paid.
- [ ] A requester cannot view or pay another requester's case.
- [ ] The UI remains usable on mobile and desktop.
- [ ] Existing request, facility-return, procurement, and repair workflows still work.

## Out of Scope for the First Version

- Replacement workflow
- Refunds or payment reversals
- Live PayMongo mode
- Finance portal/account
- Manual paper receipts
- Uploading payment proof
- GSO Head approval/signatures
- QR Ph testing

## Implementation Order After Approval

1. Create migration and data model.
2. Create secure backend settlement/payment/webhook routes and tests.
3. Add the GSO sidebar item and Loss & Damage Cases page.
4. Add the requester payment panel.
5. Run backend, frontend, and regression tests.
6. Test locally with PayMongo Test and a tunnel.
7. Deploy to Vercel staging with PayMongo Test secrets and Neon staging data.

## Scope Lock

Implementation should start only after this document is confirmed. Any future change—such as replacements, live payment, Finance access, signatures, or manual receipts—should be added as a separate decision rather than silently expanding this MVP.
