# A.SSET Admin Side — Modules at Feature Plan

## Layunin at paghahati ng roles

School asset and borrowing system ang A.SSET. Dapat ang **IT Admin** ang tumingin sa accounts, access, system-wide status, reports, at audit trail. Ang **GSO** ang magpatakbo ng inventory at araw-araw na approval, issuance, return, at repair. Ang **Borrower** naman ang mag-submit at sumubaybay sa sariling request.

Sa ganitong paghahati, hindi madodoble sa Admin ang operational pages ng GSO. Admin oversight at controls ang focus nito.

## Kasalukuyang estado ng project

- May Admin Overview sa `/admin`, pero placeholder pa ang account totals, activity, at alert feeds.
- May User Management sa `/admin/users`, pero GSO accounts pa lang ang nililista at nagagawa.
- May Audit Logs sa `/admin/audit-logs` para sa kasalukuyang inventory, category, at employee changes.
- May Borrower dashboard at `BORROWER` role na, pero account information pa lang ang ipinapakita; wala pang tunay na borrower request submission at borrowing history.
- May GSO Requests & Borrowing page, pero sample data pa ang request at borrowing rows. Ang existing issuance API ay para sa employee issuance, hindi pa borrower asset requests.

**Pangunahing dependency:** kailangang maipatupad muna ang borrower request at GSO approval workflow para makapagpakita ang Admin ng totoong borrower, pending request, active loan, at overdue data. Huwag gumamit ng sample counts bilang totoong system metrics.

## Mga kailangang Admin modules para sa school MVP

| Module / Page | Status | Kailangang laman at features |
|---|---|---|
| **Overview** — `/admin` | Meron, placeholder ang data | Ipakita ang active accounts ayon sa role, active borrowers, available/issued/repair assets, pending requests, active loans, overdue returns, at mga request na kailangan ng GSO action. Maglagay ng recent activity at alerts na galing sa totoong records. Bawat summary card ay dapat mag-link sa kaugnay na page. |
| **Users & Roles** — `/admin/users` | Meron, GSO accounts pa lang | Ilista at i-search ang IT Admin, GSO Staff, at Borrower accounts. Ipakita ang role, active/inactive status, email verification, at created date. Panatilihin ang paggawa ng GSO account; idagdag ang borrower account/profile view kapag handa na ang borrower flow. I-deactivate/reactivate kaysa mag-delete ng account para hindi mawala ang history. Role changes ay dapat limitado sa Admin at naka-audit. |
| **Borrowers** — `/admin/borrowers` | Wala pa | School borrower directory na may borrower type (hal. student/faculty/staff, ayon sa patakaran ng paaralan), school ID, department/program o grade/section kung kailangan, verified account status, at sariling requests/loans. May search at filters para makita ang active, pending verification, at restricted accounts. Ipakita lang ang kinakailangang personal data. |
| **Requests & Borrowings** — `/admin/borrowings` | Wala pang borrower data | Admin monitoring view para sa request status, borrower, item, request/due dates, GSO decision, return condition, at overdue days. Magkaroon ng Pending, Approved, Rejected, Issued, Return Pending, Returned, Overdue, at Cancelled filters kung suportado ng workflow. Read-only ang Admin decision details; GSO pa rin ang mag-aapprove, mag-i-issue, at magtatala ng return. |
| **Asset Overview** — `/admin/assets` | Wala pa | Read-only school-wide view ng asset code, item/category, condition/status, quantity, current custodian o department, at repair/retirement flags. GSO ang mananatiling may-ari ng inventory editing; Admin ang magmo-monitor at mag-iimbestiga gamit ang audit trail. |
| **Audit Logs** — `/admin/audit-logs` | Meron | Panatilihin ang actor, oras, action, entity, at dahilan. Mag-filter ayon sa date, action, user, at entity. Isama rin sa audit trail ang borrower requests, approval/denial, issuance, return, account activation, at role changes kapag nailagay na ang mga workflow na iyon. |
| **Reports** — `/admin/reports` | Wala pa | Buod ayon sa buwan/semester at department: asset availability/utilization, requests by status, overdue returns, repair/loss/damage cases, at average approval/turnaround time. Magdagdag ng CSV export o print-friendly report para sa school records. |

## Inirerekomendang Admin navigation

Ilagay ang mga core page sa ganitong ayos:

1. Overview
2. Users & Roles
3. Borrowers
4. Requests & Borrowings
5. Asset Overview
6. Reports
7. Audit Logs

Huwag gawing clickable ang hindi pa nagagawa. Itago muna o lagyan ng malinaw na **Coming soon** state ang future modules para hindi magmukhang gumagana ang placeholder.

## Workflow na dapat maipakita sa Business Process Automation demo

1. Nag-submit ang borrower ng asset request, purpose, at kailangang petsa.
2. System ang nagche-check ng kumpletong detalye, borrower eligibility, at availability.
3. GSO ang nagre-review at nag-aapprove o nagre-reject, kasama ang dahilan.
4. Sa approval at aktuwal na issuance, nagbabago ang asset/quantity status at naitatala ang due date.
5. Bago at lampas sa due date, nagpapadala ang system ng reminder sa borrower at GSO.
6. Sa return, GSO ang nagtatala ng kondisyon. Ang maayos na item ay bumabalik sa available; ang may sira ay napupunta sa repair queue.
7. Bawat status change at decision ay may actor, timestamp, at audit record. Admin ang nagmo-monitor ng exceptions at reports.

**Suggested status path:** `Submitted → Pending GSO Review → Approved / Rejected → Issued → Return Pending → Returned / For Repair → Closed`.

## Hiwalay na suggestions para sa susunod na phase

Optional ang mga ito kapag gumagana na ang core borrower-to-GSO workflow:

- **Roles & Permissions page:** granular permissions kung dadami ang Admin at GSO staff; panatilihin ang least-privilege access.
- **Security Logs:** failed logins, OTP/reset events, account lockouts, at suspicious activity. Ihiwalay ito sa business audit log.
- **Borrowing Policy Settings:** configurable loan period, maximum items, eligibility rules, reminder schedule, at approval rules na inaprubahan ng paaralan.
- **Notifications:** in-app/email alerts para sa request decisions, due-soon reminders, overdue notices, at return approvals.
- **QR/barcode asset labels:** mas mabilis na checkout, return, at physical inventory count.
- **Backup and retention controls:** documented backup schedule, restore procedure, at data-retention rules para sa school records.
- **Advanced reporting:** printable semester reports, department comparisons, asset utilization trends, at exportable charts.

## Suggested implementation order

1. Tapusin ang borrower profile, request submission, at borrower request history.
2. Ikonekta ang GSO request/approval, issuance, at return pages sa persisted records; palitan ang sample rows.
3. Kumpletuhin ang Admin Users & Roles at gumawa ng Borrower Directory.
4. Ikonekta ang Admin dashboard sa totoong counts, idagdag ang Borrowing Oversight at Asset Overview, at palawakin ang Audit Logs.
5. Idagdag ang Reports at saka piliin ang optional settings, security, at notification features ayon sa oras ng project.

## Mahahalagang acceptance rules

- Borrower: makakakita at makakakilos lang sa sariling account at request.
- GSO: makakakita ng operational queues at siya ang gagawa ng approval, issuance, return, at repair updates.
- IT Admin: makakakita ng school-wide overview at mag-aasikaso ng accounts/access; hindi nito dapat tahimik na palitan ang GSO decision.
- Naka-log ang mahahalagang pagbabago, kasama ang sino, ano, kailan, at dahilan.
- Walang dashboard card o report na magpapakita ng mock/sample data bilang totoong school data.

> **Implementation note:** requirements at recommendations ang dokumentong ito. Hindi nito binabago ang backend; kailangan lang ng karagdagang API/database work sa susunod na development phase para maging live ang borrower requests at admin metrics.
