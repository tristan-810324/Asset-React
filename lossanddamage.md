# Loss & Damage Cases

## Purpose

The Loss & Damage workspace lets GSO Staff review a requester's loss or damage report, document the decision, resolve the item's custody, and close the case. It does not process online payments.

## Case flow

```text
Requester submits a Loss / Damage Report
                |
                v
GSO Staff starts the review
                |
                v
Choose a resolution
  |-- No charge  ---> Close the case and resolve the reported item custody
  '-- For repair ---> Complete the physical follow-up ---> Close the case
```

For either resolution, GSO Staff must identify any individual tracked units before saving the decision. A resolved reported unit is removed from the requester's outstanding issued-items list.

## Roles

| Actor | Responsibility |
| --- | --- |
| Requester | Submit the incident report and read GSO's decision on the request-detail page. |
| GSO Staff | Start review, choose a resolution, record the reason, complete physical handling, and close repair cases. |
| A.S.SET | Keeps the timeline, audit trail, notifications, decision, and custody status in sync. |

## GSO experience

The GSO Loss & Damage page has these case queues:

- New reports
- Under review
- For repair
- Closed

GSO can start a review, choose **No charge** or **For repair**, write the reason, identify reported units when needed, and close a repair after the physical follow-up is complete.

## Requester experience

The existing request-detail page shows the review state, GSO's resolution, reason, and closure status. No extra sidebar page is required.

## Data and safety rules

- One settlement record belongs to each Loss & Damage or Facility Use damage request.
- Loss & Damage resolutions are `NO_CHARGE`, `FOR_REPAIR`, or the provider-neutral historical state `RESOLVED`.
- Facility Use unserviceable returns use the same record for a no-charge decision while retaining their separate return workflow.
- GSO-only routes require the `GSO_STAFF` role. Requesters can read only their own case.
- Decisions, custody transitions, and closure actions create request history, notifications, and audit entries.

## Verification checklist

- [ ] A requester can submit a Loss / Damage Report.
- [ ] GSO can start review and select No charge.
- [ ] GSO can select For repair and close it after physical handling.
- [ ] Reported items leave the requester's outstanding issued-items list only after GSO resolves them.
- [ ] A requester cannot read another requester's case.
- [ ] Facility Use, issuance, procurement, and repair workflows remain available.
