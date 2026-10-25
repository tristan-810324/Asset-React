# Mga Posibleng Functionalities ng A.SSET

> Brainstorming document lamang ito. Walang binagong application code.
> Ang filename ay `posiblefunctionalities.tsx` ayon sa hiling; Markdown ang laman nito.

## Batayan at layunin

Batay ang mga ideya sa frontend at backend modules, API routes, database migrations, at sa [installation guide](./istallations1.0.md). Nakatuon ang A.SSET sa pamamahala ng school assets at sa mga request ng borrowers, GSO staff, at IT Admin.

**Tandaan:** Hindi lumitaw sa workspace ang nilalaman ng naka-attach na “Pasted text #1”. Kaya hindi ko pa naisasama ang mga puntong maaaring nakasulat doon; puwede natin itong idagdag kapag naibahagi ang teksto.

## Mga functionality na mayroon na sa code

| Bahagi | Kasalukuyang functionality |
|---|---|
| Access at account | May `BORROWER`, `GSO_STAFF`, at `IT_ADMIN` roles; login, borrower registration, email OTP verification, password reset, at role-protected pages. |
| Borrower requests | May limang uri ng form: borrowing, facility use, job/service, purchase requisition, at loss/damage report. Maaaring tingnan ang sariling requests, mag-cancel sa pinapayagang status, sumagot kapag humingi ng dagdag na impormasyon, at humiling ng return para sa issued borrowing. |
| Request processing | May GSO inbox na may type/status/search filters, request details at history, review notes, at status transitions na nag-iiba ayon sa uri ng request. Para sa borrowing, naiuugnay ang mga item sa inventory at naitatala ang issuance, due date, at return condition. |
| Inventory | Maaaring maglista, magdagdag, at mag-update ng items at categories. May quantity, available quantity, unit, acquisition/current values, condition/status, at change history/audit reason. May export actions sa ilang GSO inventory at issuance/return pages. |
| Employees at staff issuance | May employee records, department list/add, profile picture, employee status, assignment history, batch issuance ng maraming item, email approval links, at pagproseso ng returns kasama ang quantity/condition. |
| IT Admin | Maaaring maglista at gumawa ng GSO accounts at tumingin sa audit logs gamit ang action, entity, search, at date filters. |
| Borrower updates/profile | Ipinapakita ang request-status history bilang updates. Read-only ang borrower profile sa kasalukuyang workflow. |

## Mga bahaging mayroon na pero hindi pa full/live

- **GSO dashboard:** May executive analytics layout, pero may hard-coded sample distribution/condition values sa `frontend/src/gso/gsodashboard.tsx`; hindi pa ito live na buod mula sa database.
- **IT Admin dashboard:** May malinaw na placeholder ang `frontend/src/admin/admindashboard.tsx` para sa account totals, activity, security events, at alerts na hindi pa konektado sa live data.
- **GSO notification center:** May filters, priorities, read/unread, dismiss, at restore-preview UI sa `frontend/src/gso/notifications.tsx`, pero preview data ang laman at `localStorage` ang persistence nito—hindi pa ito nakatali sa backend events.
- **Borrower updates:** Kinukuha nito ang history ng sariling requests; hindi pa ito hiwalay na notification service na may unread state, delivery preferences, o email/push delivery.
- **Department rename/delete:** May UI actions sa `frontend/src/gso/employemasterdata.tsx`, pero local state lang ang binabago ng rename/delete handlers. Ang backend department routes ay list at create lang; kaya hindi pa persistent ang mga pagbabagong iyon.
- **GSO account lifecycle:** Nasa admin UI ang list/create, pero wala pang API flow para mag-edit, mag-deactivate/reactivate, o mag-reset ng staff account. May nakapirming initial password sa kasalukuyang create-account screen.

## Mga posibleng susunod na functionality

### 1. Live dashboards at operational metrics — mataas ang priyoridad

Palitan ang sample/placeholder cards ng data mula sa database.

- **Para sa GSO:** total at available items, issued/borrowed assets, pending requests, due-soon/overdue returns, items for repair, at request volume ayon sa uri/status.
- **Para sa IT Admin:** total/active/unverified accounts, recent audit activity, failed sign-ins/security events, at backend/database health.
- Maglagay ng date range at department filters, at links mula sa bawat metric papunta sa kaugnay na filtered list.

**Bakit bagay ito:** May dashboard screens na, at naka-store na ang inventory, request, employee, at audit records. Ang pangunahing dagdag ay backend summary endpoints at pag-uugnay ng UI sa mga iyon.

### 2. Persistent notifications na galing sa totoong events — mataas ang priyoridad

Gawing database-backed ang GSO notification center at buuin ang borrower updates mula sa parehong event stream.

- Gumawa ng notification kapag may bagong borrower request, status change, kailangan ng impormasyon, approval, issuance, return, o repair update.
- Magkaroon ng unread count, mark read/unread, dismiss/archive, at notification history na hindi nawawala kapag nagpalit ng device o browser.
- Mag-link ang notification sa tamang request, inventory item, o employee record.
- Puwedeng idagdag kalaunan ang email notifications at configurable delivery preferences.

**Bakit bagay ito:** May `service_request_history` at audit/change history na maaaring pagmulan ng mga event. Ang kasalukuyang GSO preview inbox ay lokal lamang.

### 3. Due-date reminders at overdue tracking — mataas ang priyoridad

- Magpakita ng “due soon” at “overdue” badges sa borrower at GSO views.
- Magpadala ng paalala bago ang due date at follow-up kapag lampas na rito.
- Magkaroon ng listahang puwedeng i-filter ayon sa department, borrower, tagal ng pagka-overdue, at item.
- Itala kung kailan ipinadala ang paalala upang maiwasan ang paulit-ulit o dobleng email.

**Bakit bagay ito:** May expected return/due dates at return workflows na; ang ideya ay magdagdag ng malinaw na reminder at follow-up layer.

### 4. Kumpletong department management — mataas na priyoridad

Magdagdag ng backend update/delete endpoints at persistence para sa rename at delete actions na nakikita na sa employee UI. Magdagdag din ng safeguards kapag may employees na gumagamit pa ng department, at audit entry para sa bawat pagbabago.

**Bakit bagay ito:** May department list/create API na, at may UI na para sa rename/delete, kaya malinaw ang susunod na hakbang para maging buo ang functionality.

### 5. GSO account lifecycle at mas maayos na onboarding

- Mag-edit ng pangalan/email at mag-deactivate/reactivate ng GSO account.
- Magkaroon ng admin-triggered password reset o secure na one-time invite/setup link sa halip na iisang nakapirming initial password.
- Ipakita ang verification state, huling login, at account status sa user-management table.
- Itala ang mga account/security action sa admin audit feed.

**Bakit bagay ito:** Nasa `IT_ADMIN` role ang account management, pero kasalukuyang list/create lang ang routes at service.

### 6. Facility booking calendar at mas malinaw na conflict handling

- Ipakita ang facility requests sa calendar view ayon sa venue at oras.
- I-highlight ang magkakapatong na booking at magmungkahi ng ibang available na oras o venue.
- Magkaroon ng calendar/list filters at printable schedule para sa GSO.

**Bakit bagay ito:** May facility-use form na may venue, date, start time, at end time. Mas madaling makita at ayusin ang conflicts sa calendar kaysa sa listahan lamang.

### 7. Attachments at supporting documents para sa requests

Payagan ang pag-attach ng quotation, larawan ng damage/loss, facility layout, o karagdagang dokumento sa angkop na request forms. Magtakda ng file type/size limits at access rules para borrower at GSO lamang ang makakita ng mga attachment na may kaugnayan sa request.

**Bakit bagay ito:** May structured forms para sa purchase, facility, job, at loss/damage requests, pero ang kasalukuyang request data ay form fields lamang.

### 8. Drafts at pag-edit ng request bago ito ma-review

- Mag-save ng hindi pa tapos na request bilang draft.
- Payagan ang borrower na mag-edit habang nasa `Submitted` o `Needs Information` state, kung hindi pa ito naaprubahan.
- Ipakita ang malinaw na validation at “last saved” state.

**Bakit bagay ito:** Ang kasalukuyang workflow ay nakatuon sa submit/cancel/respond; draft recovery at pre-review editing ay magpapagaan sa mahahabang multi-row forms.

### 9. Mas malawak na asset lifecycle at stock control

- Magdagdag ng stock receiving/acquisition transaction para makita kung kailan at bakit nadagdagan o nabawasan ang quantity.
- Magtakda ng low-stock threshold at alert para sa consumables.
- Magdagdag ng serial number/individual asset tag para sa mga asset na kailangang subaybayan bawat unit, bukod sa kasalukuyang quantity-based records.
- Gumamit ng QR/barcode label para sa mabilis na lookup, issuance, return, at physical inventory count.
- Magdagdag ng inventory reconciliation/stocktake flow na nagtatala ng expected vs. actual count at dahilan ng adjustment.

**Bakit bagay ito:** May item code, quantity, condition, status, at acquisition data na; mapapalawak ito tungo sa mas kumpletong custody at stock control.

### 10. Maintenance workflow na may history at gastos

- Gumawa ng repair/maintenance record sa bawat item: problema, petsa, assigned staff/vendor, estimate, aktuwal na gastos, at completion date.
- Magkaroon ng statuses gaya ng reported, scheduled, in repair, awaiting parts, at repaired.
- Iugnay ang maintenance record sa item change history at sa `to-be-repaired` queue.

**Bakit bagay ito:** May `Needs Repair`/`Under Maintenance` conditions at repair screen na; masusundan nito ang buong proseso, hindi lang ang kasalukuyang kondisyon ng item.

### 11. Pinagsama-samang reports at exports

May export actions na sa ilang GSO pages. Maaaring dagdagan ito ng report center na may date range at filters para sa:

- inventory ayon sa category, department, condition, at availability;
- issued, returned, overdue, at unreconciled assets;
- requests ayon sa uri, status, department, at turnaround time;
- repair/maintenance costs at item values;
- audit activity para sa napiling panahon.

Puwedeng magbigay ng CSV/Excel para sa analysis at print-friendly/PDF reports para sa filing. Iwasang magdoble ng export controls kung mayroon nang katumbas sa isang page.

### 12. Borrower profile update request

Magbigay ng ligtas na paraan para humiling ng pagbabago sa pangalan o school details, na may review/approval kung kinakailangan. Read-only pa ang profile ngayon at pinapapunta ang borrower sa administrator para sa correction.

## Mungkahing pagkakasunod-sunod

1. **Ayusin ang persistence gaps:** department rename/delete, live GSO/Admin metrics, at tunay na notification storage.
2. **Pagandahin ang araw-araw na operations:** due-date reminders, overdue queue, facility calendar, at GSO account lifecycle.
3. **Palawakin ang request at asset handling:** attachments/drafts, stocktake, asset tags, at maintenance records.
4. **Gawing mas madali ang reporting:** unified report filters at exports batay sa aktuwal na database data.

## Mga tanong para sa susunod nating usapan

- Alin ang pinakamahalagang problema ngayon: hindi updated na dashboard, nawawalang notifications, o hirap sa pagsubaybay ng due/overdue items?
- Sino ang pangunahing gagamit ng susunod na feature: borrower, GSO staff, o IT Admin?
- Gusto ba nating unahin ang maliit na improvement na mabilis matapos, o ang mas malaking feature gaya ng QR/barcode at asset-by-asset tracking?
