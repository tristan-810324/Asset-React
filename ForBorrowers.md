# Borrower / Requestor Mobile Section — Brainstorm

> **Status:** Brainstorming draft. Mga mungkahi ito mula sa apat na paper forms at sa kasalukuyang GSO request page. Hindi pa ito final requirements o backend design.

## Unang desisyon: hindi lang ito para sa borrowers

Ang mga form na ipinakita ay may facility permit, job request, purchase requisition, at loss/damage report. Hindi lahat ng ito ay panghiram ng asset. Kaya mas babagay ang pangalan na **Request Center** o **School Services** sa mobile section; magiging isa lang sa mga request category ang **Borrow / Borrowing**.

Puwedeng gamitin ang portal ng mga awtorisadong school requestors—halimbawa, students, faculty, staff, o department/organization representatives—depende sa patakaran ng paaralan. Magpapakita lang ang app ng mga request type na pinapayagan para sa account ng user. Kailangan pa nating pagdesisyunan kung anong account types ang papayagan.

Sa kasalukuyang GSO page, nakalista ang Purchase Request, Job Request, Permit to use School Facilities, Request for Services, at Permit to use School Vehicle. Sample data pa ang laman ng queue; wala pang persisted borrower/requester submission flow. Wala ring larawan dito ng opisyal na Vehicle Permit at Request for Services forms, kaya huwag muna nating imbentuhin ang eksaktong fields ng mga iyon.

## Mga form na nakita at maaaring gawing digital request

| Form | Pangunahing layunin | Mga field na mababasa sa form | Ideya para sa mobile flow |
|---|---|---|---|
| **Permit to Use School Facilities** | Humiling gumamit ng venue at kagamitan | Requestor, department/year & section/organization, activity, purpose, curricular/co-curricular/other, date/time, participants, venue, equipment/materials at quantity, remarks, recommending approval, received at approved sign-offs | Venue at oras, purpose, participants, at equipment ang ilalagay sa guided form. Bago isumite, tingnan kung may schedule conflict. Ipakita ang approval status at venue confirmation. |
| **Job Request Form** | Humiling ng trabaho o serbisyo mula sa GSO | Date, control number, area/department, date required/completed, purpose, quantity, particulars, nature of work, remarks, requestor, noted/recommending/approved by, completed work check | Ituring bilang work order. Puwedeng magdagdag ng maraming task/material rows, larawan, urgency at preferred schedule. Pagkatapos ng review, ipakita kung naka-assign, ginagawa, o kumpleto na; maaaring kumpirmahin ng requestor ang completion. |
| **Purchase Requisition Form** | Humiling bumili ng supplies/equipment | Control number, department/office/area, required date, isang category per form, quantity, item description/specifications, purpose, requested/checked/recommended/approved sign-offs | Bawat request ay may iisang category gaya ng form na nakasaad. Bawat item ay may quantity at detalyadong specs. I-validate ang two-week lead time; ilagay sa hiwalay na emergency path ang urgent requests kung pinapayagan ng school policy. |
| **Losses and Damages Report Slip** | Mag-ulat ng nawawala o nasirang property | Key area, date, control number, quantity, item/description, remarks, reported/responsible by, checked by, verified by, recommendation | Gawing incident report na may pagpili kung **Lost** o **Damaged**, asset tag/control number kung alam, lokasyon at petsa, paliwanag, at optional na litrato. Ihiwalay ang inspection at investigation; huwag awtomatikong mag-charge o magparusa sa user. |

## Iminungkahing mobile navigation

- **Home** — bagong request, pending actions, due dates, at kamakailang status updates.
- **Request Center** — cards para sa mga form na available sa user: Borrow an Asset, Facility Use, Job/Service Request, Purchase Requisition, at Loss/Damage Report.
- **My Requests** — sariling requests lang ng user, searchable/filterable ayon sa type at status.
- **Notifications** — approvals, kailangan ng dagdag na impormasyon, schedule changes, at paalala.
- **Profile** — pangalan at school identity mula sa account; department/program/organization kung kailangan.

Ipakita ang **Borrowing / My Loans** bilang hiwalay na bahagi sa loob ng Request Center o sa Home. Huwag pangalanang “Borrowers” ang buong mobile app kung kasama rito ang permits, procurement requests, at incident reports.

## Shared na paraan ng paggawa ng request

Maganda ang iisang request experience pero may sariling fields at approvals ang bawat form. Iwasan ang isang napakahabang generic form na maraming hindi kaugnay na fields.

1. Pumili ng request type.
2. Sagutan ang maikling guided form na angkop sa type na iyon.
3. Mag-save bilang draft kung hindi pa handang isumite.
4. Ipakita ang review/summary screen at missing-field warnings.
5. Pagkatapos isumite, gumawa ng reference/control number at receipt.
6. Ipakita ang status timeline, assignee/approver step kung naaangkop, decision reason, at susunod na kailangang gawin.
7. Payagan ang edit o cancel ayon sa status at school rules; huwag baguhin ang request matapos itong ma-approve nang walang bagong audit event.

**Shared fields na maaaring gamitin kung kailangan:** requester account, department/organization, purpose, requested date, contact detail, remarks, attachments, reference number, submission timestamp, status history. Huwag ipaulit sa user ang impormasyong mayroon na sa verified profile maliban kung kailangan itong kumpirmahin.

Para sa mga table sa papel, gumamit sa mobile ng **repeatable item/task cards** na may “Add item” button. Mas madaling gamitin ito sa telepono kaysa piliting magpakita ng malapad na spreadsheet-style table.

## Iminungkahing workflows ayon sa request type

### 1. Borrow / asset borrowing

Pumili ng available na asset, maglagay ng purpose at kailangang petsa, at isumite. Iche-check ng system ang eligibility at availability. GSO ang mag-aapprove, magtatala ng aktuwal na pag-issue at due date, at magkukumpirma ng return at kondisyon. Ang borrower ay makakakita ng request history, active loans, due dates, at return instructions.

### 2. Facility use

Isumite ang activity, venue, petsa/oras, participant estimate, at equipment. Suriin ang venue availability bago isumite at i-recheck ito sa approval upang maiwasan ang double booking. Ipakita kung pending ang recommendation/approval, confirmed, rejected, o kailangan baguhin ang schedule. Kumpirmahin pa kung anu-ano ang eksaktong approver at sequence; may mga sign-off line sa papel para sa Department Head, OIC/Property Controller, at GSO Director.

### 3. Job / service request

Ilarawan ang area, problema o gawaing kailangan, due date, at mga kaugnay na item/material. Maaaring dumaan ang GSO sa triage, assignment, scheduling, work-in-progress, completion, at requestor confirmation. Magtala ng completion date at work notes para mapanatili ang service history.

### 4. Purchase requisition

Ilista ang bawat item, quantity, specifications, purpose, category, at date needed. I-validate ang nakasaad na minimum na dalawang linggong lead time, na may hiwalay na exception process para sa urgent purchase kung aprubado ng school. Sa unang release, requisition at approval tracking lang ang scope—huwag ipalagay na kasama na ang supplier quotation, purchase order, payment, o receiving process hangga't hindi iyon napagpapasyahan.

### 5. Loss / damage report

Gumawa ng report para sa incident, hindi ordinaryong borrowing request. Paghiwalayin ang **Damaged** at **Lost** dahil magkaiba ang inspection at follow-up. Maaaring idagdag ang asset verification, photo evidence, investigation/recommendation, repair referral o missing-item resolution, at closure. Limitahan ang access sa report sa requester at mga itinalagang reviewer; panatilihin ang audit trail. Kailangan munang kumpirmahin ang school policy sa responsibility, valuation, at anumang liability bago magdisenyo ng ganitong workflow.

### 6. Vehicle permit at generic Request for Services

Nasa request type list ang mga ito sa kasalukuyang GSO UI, pero wala sa mga larawang ipinadala ang kanilang official form. Kunin muna ang aktuwal na forms at approval rules bago gumawa ng final mobile form; maaaring mangailangan ang vehicle request ng destination, itinerary, passengers, schedule, at driver, pero kailangan itong kumpirmahin sa school.

## Mga status at automation na kapaki-pakinabang

Gumamit ng status path na angkop sa bawat proseso, hindi iisang status list para sa lahat. Halimbawa:

- **Common:** Draft → Submitted → For Review → Needs Information → Approved / Rejected → Closed / Cancelled.
- **Borrowing:** Approved → Ready for Pickup → Issued → Return Pending → Returned / For Repair / Overdue.
- **Facility:** For Recommendation → For GSO Approval → Confirmed → Completed / Cancelled.
- **Job request:** For Triage → Assigned → In Progress → Completed → Verified / Closed.
- **Loss/damage:** Reported → For Verification → Under Review → Action Required → Resolved / Closed.

Mga automation na puwedeng pag-usapan: auto-generated control number, required-field validation, routing sa tamang approver, email/in-app notifications, due-date reminders, conflict checks sa facility schedule, at audit record para sa bawat decision/status change. Ipakita ang dahilan kapag may rejection o request for revision.

## Iminungkahing phased scope

### Core demo / MVP

- Shared Request Center at profile-based requester identity
- My Requests list, detail, status timeline, at in-app notifications
- Asset borrowing request at GSO checkout/return workflow
- Facility Use Permit at Job Request bilang dalawang magkaibang proseso
- GSO review queue at audit trail; walang sample data na ipapakita bilang totoong request

### Susunod na phase

- Purchase Requisition kapag malinaw na ang urgent-request exception at approval chain
- Loss/Damage reporting kapag napagkasunduan ang verification, investigation, access, at resolution policy
- Vehicle Permit at Request for Services kapag naibigay na ang opisyal na forms
- Printable/PDF output na kahawig ng approved school form, kung kailangan pa rin ang physical copy
- Push notifications, QR/barcode scan, offline draft, at photo attachments ayon sa pangangailangan

## Mga kailangang pagdesisyunan bago gawing final

1. Sino ang puwedeng mag-submit: students, faculty, staff, department heads, organization representatives, o lahat ng ito?
2. Iisa ba ang login/account ng lahat ng requestors? Aling request types ang available sa bawat user type?
3. Ano ang eksaktong approval sequence at authority para sa bawat form? Digital approval ba ang tatanggapin, o kailangan pa rin ng printed form/signature?
4. Sino ang magbibigay ng control/reference number at kailan ito gagawin?
5. Maaari bang baguhin o kanselahin ang request habang pending? Ano ang mangyayari kapag kailangan ng revision?
6. Ano ang facility conflict, cancellation, setup/cleanup, at equipment-return rules?
7. Ano ang urgency categories, assignment, at completion confirmation sa Job Request?
8. Ano ang emergency purchase process, required quotations, at hangganan ng system sa procurement workflow?
9. Sa loss/damage reports, paano ibe-verify ang asset, sino ang may access, at anong follow-up ang pinapayagan ng school policy?
10. Maaari bang makuha ang opisyal na Vehicle Permit at Request for Services forms para maplano rin ang tamang fields?

## Hiwalay na suggestions

- **Pangalan:** gamitin ang “Request Center” sa navigation; panatilihin ang “Borrowing” bilang isang category.
- **Usability:** mobile-first, isang hakbang/form section kada screen, autosave draft, malinaw na validation, at request receipt pagkatapos isumite.
- **Recordkeeping:** panatilihin ang original submission at status history; i-audit ang edits, approvals, at cancellations.
- **Official documents:** mag-generate ng print/PDF copy kung kailangan sa school records; kumpirmahin muna kung sapat ang authenticated digital approval kapalit ng wet signature.
- **Scope discipline:** huwag munang gawing generic form builder para sa lahat. Gumamit ng magkakahiwalay na form at workflow na may shared reusable fields.

> **Tala:** Planning document ito batay sa mga larawang ibinigay at sa kasalukuyang GSO UI. Wala pang binagong frontend implementation, API, o database. I-verify ang policies, approval roles, at official form details sa paaralan bago magsimula ng development.

## Expected outcome: Borrower / Requester mobile section

### Pangunahing experience

Ang mobile app ay magiging **A.SSET Request Center** para sa school requestors. Makakapasok ang borrower sa asset borrowing, habang ang ibang awtorisadong requestors ay makakakita ng permits, job/service requests, purchase requisitions, at incident reporting ayon sa role at patakaran nila. Hindi kailangang lumabas ang lahat ng request cards sa bawat account.

Sa mobile layout, gamitin ang top header para sa school/app identity at account actions, at bottom navigation para sa pangunahing pages. Hindi na kailangan ng desktop-style sidebar sa maliit na screen.

### Proposed top header at navigation

**Header / top bar**

- A.SSET o school logo at app name.
- Kasalukuyang page title, gaya ng “Home,” “Request Center,” o “My Requests.”
- Bell icon na may unread count; bubukas sa Notifications.
- Profile/avatar button na may pangalan at menu para sa Profile, Help/Request Guidelines, at Sign out.
- Ipakita ang offline/error state kung walang koneksyon; huwag ipakitang naipasa ang request kung hindi kinumpirma ng server.

**Bottom navigation — apat na pangunahing tab**

1. **Home** — overview, quick actions, pending items, due dates, at recent updates.
2. **Request Center** — service catalog at paggawa ng bagong request.
3. **My Requests** — history, status tracking, at action-needed list. Dito rin makikita ang borrowing request at active loans.
4. **Profile** — verified school identity, department/program/organization kung kailangan, account settings, guidelines, at sign out.

Maaaring manatiling bell icon sa top header sa halip na kumuha ng hiwalay na bottom tab para sa Notifications. Kung maraming notification features sa susunod, saka pag-isipan kung kailangan ng sariling tab.

### Home screen

- Greeting at pangalan ng naka-sign-in na requester.
- Primary button: **New Request**.
- Summary tiles na galing lamang sa totoong account records: In Review, Needs My Action, Approved/Upcoming, Active Loans, at Overdue kung naaangkop.
- “Continue draft” card para sa hindi pa naipapasang form.
- “Next due” area para sa loan return, approved facility schedule, o request deadline.
- Recent request list na may type, reference number, status, at huling update.
- Empty state na nagtuturo kung paano magsimula ng unang request.

### Request Center screen

Ipakita bilang searchable service cards na may maikling paliwanag, kailangang impormasyon, at eligibility note:

- **Borrow an Asset** — browse ng puwedeng hiramin at availability.
- **Facility Use Permit** — humiling ng venue, schedule, at kagamitan.
- **Job / Service Request** — mag-report ng trabahong kailangang gawin sa area/department.
- **Purchase Requisition** — mag-submit ng item at specification request.
- **Loss / Damage Report** — mag-ulat ng incident sa school property.
- **Vehicle Permit** — ipakita kapag naaprubahan na ang official form, access rules, at schedule process.

Kung hindi eligible ang user sa isang request type, itago ito o ipaliwanag kung sino ang dapat magsumite. Huwag magpakita ng disabled-looking form na walang paliwanag.

### New Request form experience

Ang form ay mobile-first, may malinaw na progress indicator, at nahahati sa maikling steps:

1. **Piliin ang request type.**
2. **Requester details.** I-prefill ang verified account name/email; piliin o ipakita ang department/program/organization kung pinapayagan.
3. **Request-specific details.** Ipakita lamang ang fields na kailangan sa napiling form. Para sa item/task lists, gumamit ng repeatable cards at “Add another item” action.
4. **Schedule, quantities, at attachments.** Gumamit ng date/time pickers, quantity validation, at optional photo/document upload kung may policy.
5. **Review.** Ipakita ang lahat ng sagot, required approvals, at reminders bago isumite.
6. **Submit / save draft.** Pagkatapos ng successful submission, ipakita ang reference number at receipt. Ang draft ay hindi pa makikita sa GSO approval queue.

**Halimbawa ng fields kada request type:**

- **Borrow an Asset:** asset/item, quantity o specific asset tag kung kailangan, purpose, needed date, return date, pickup location, at acknowledgment ng borrowing rules.
- **Facility Use:** activity, purpose, curricular/co-curricular/other, date at time, estimated participants, venue, equipment/materials at quantity, at remarks.
- **Job / Service:** area/department, nature of work, purpose, requested completion date, priority kung pinapayagan, repeatable particulars/materials, remarks, at supporting photos.
- **Purchase Requisition:** one category per form, required date, purpose, at repeatable rows na may quantity at item description/specifications. Ipakita ang two-week lead-time rule at approved exception option kung mayroon.
- **Loss / Damage:** Lost o Damaged, area/location, incident date, asset/control number kung alam, quantity, item description, nangyari/remarks, responsible person kung naaangkop, at optional evidence photo.

### My Requests at request details

Sa **My Requests**, maaaring mag-filter sa All, Needs My Action, In Review, Approved/Upcoming, Rejected, at Completed/Closed. May request-type filter at search gamit ang reference number.

Sa request detail, ipakita ang:

- Control/reference number, request type, submission date, at current status.
- Buong form details at attachments.
- Timeline: kailan isinumite, sino ang nag-review, ano ang decision, at kailan nagbago ang status.
- Reason kapag tinanggihan o kailangang baguhin.
- Next step at due date kung may aksyon ang requester.
- Edit, provide information, cancel, download/print, o acknowledge actions lamang kapag pinapayagan ng status at patakaran.

Ang active borrowing record ay magpapakita rin ng asset, condition on issue, checkout date, due date, return instructions, return request/confirmation status, at overdue notice. Ang requestor ay hindi maaaring magmarka ng asset bilang physically returned nang walang GSO confirmation.

### Notifications at Profile

- **Notifications:** submission receipt, kailangan ng dagdag na impormasyon, recommendation/approval, rejection reason, facility schedule confirmation/change, job status, purchase decision, at due/overdue reminders.
- Bawat notification ay may link pabalik sa tamang request; maaaring markahan bilang read.
- **Profile:** pangalan at verified email, account type, school ID at department/program/organization kung kailangan, notification preferences, request guidelines, privacy/help contact, at sign out.
- Huwag magpakita ng sensitibong loss/damage investigation details sa ibang requestors o sa public feed.

### Ano ang magiging pakinabang sa requester

Pagkatapos maipatupad ang napagkasunduang flows, makikita ng user kung anong request types ang maaari niyang gamitin, makakapagsumite mula sa telepono, makakakuha ng reference number, at masusubaybayan ang decision at susunod na hakbang nang hindi paulit-ulit na nagtatanong sa GSO. Magkakaroon ng iisang lugar para sa sariling requests at borrowing history, habang magkakaiba pa rin ang fields at proseso ng bawat service.

## Ano ang kailangang idagdag o palawakin sa GSO module

### Kasalukuyang GSO navigation

Sa kasalukuyang [GSO navbar](./frontend/src/components/navbars/gsonavbar.tsx), makikita ang Overview, Item Master Data, Employee Master Data, Issuance & Returns, To Be Repaired, Requests & Borrowing, at Notifications. Nasa Requests & Borrowing page ang sample request queue at sample borrowing records.

### Iminungkahing GSO navigation

Panatilihin ang kasalukuyang operations pages at palawakin ang request entry:

1. **Overview** — real GSO workload at urgent tasks.
2. **Requests & Services** — palitan ang label na “Requests & Borrowing” kapag kasama na ang facility, job/service, purchase, at loss/damage requests. Isang queue page ito na may request-type tabs/filters.
3. **Facility Calendar** — bagong page kung gagamitin ang facility permit at kailangang iwasan ang schedule conflicts.
4. **Item Master Data** — panatilihin; dito pa rin ang inventory details.
5. **Employee Master Data** — panatilihin para sa GSO-managed school personnel records.
6. **Issuance & Returns** — panatilihin; dito itatala ang aktuwal na asset handover at return.
7. **To Be Repaired** — panatilihin at ikonekta sa verified damage reports.
8. **Notifications** — panatilihin at dagdagan ng GSO task alerts.

**Optional pagkatapos ng core workflow:** GSO Reports/Analytics para sa request volume, turnaround, facility use, work orders, loans/overdues, at loss/damage cases. Huwag gumawa ng hiwalay na navbar entry para sa bawat form kung maaari itong ayusin bilang tab sa Requests & Services; mas madaling panatilihin ang navigation.

### Requests & Services queue page

Palitan ang sample rows sa kasalukuyang [Requests & Borrowing page](./frontend/src/gso/borrowing.tsx) ng persisted requests kapag handa na ang data flow. Iminungkahing page contents:

- Summary cards: New/Pending, Needs GSO Action, Needs Requester Info, Approved/Upcoming, In Progress, Overdue, at Open Incidents.
- Tabs: **All**, **Borrowing**, **Facility Use**, **Job/Service**, **Purchase**, **Loss/Damage**, at **Vehicle** kapag available na ang official form.
- Filters: request type, status, department/organization, requester, submission date, required date, assignee, at priority kung may approved priority policy.
- Search: reference number, requester name/school ID, department, asset code, o item description.
- List/table fields: reference number, type, requester, department, submitted date, needed date, current step, assignee, at status.
- Clear queue cues: aging/overdue badge, missing information, schedule conflict, at request needing decision.
- Request detail panel/page na nagbabago ayon sa form type at nagpapakita ng submitted values, attachments, approval steps, activity history, and allowed actions.

GSO actions na maaaring suportahan: Mark for Review, Request More Information, Recommend/Approve/Reject ayon sa authority, Assign, Schedule, Record Issuance/Return, Record Work Completion, Verify Incident, at Close. Mag-require ng reason kapag reject, return for revision, o may material status change. Ipakita lang ang action sa user na may tamang authority.

### GSO workflow at responsibilidad ayon sa uri

| Request type | Idadagdag sa GSO operations | Link sa kasalukuyang GSO pages |
|---|---|---|
| **Borrowing** | Review eligibility/availability; approve or reject; reserve kung kailangan; mag-record ng asset tag, issue condition, borrower acknowledgment, due date, return condition, at overdue handling. | Ikonekta ang Requests & Services sa Item Master Data, Issuance & Returns, To Be Repaired, at Notifications. |
| **Facility Use** | Review venue/equipment request; conflict check; recommendation/approval; confirm schedule; record release/return of equipment at completion/cancellation. | Bagong Facility Calendar; equipment use/return may link sa inventory at notifications. |
| **Job / Service** | Triage; set approved priority; assign GSO staff/team; schedule; record progress, work notes/materials, completion date, at verification. | Maaaring sariling work-order tab sa Requests & Services; repair-related jobs may link sa To Be Repaired. |
| **Purchase Requisition** | Validate category/specifications/quantity/need-by date; request clarification; route sa tamang approval chain; record decision at procurement handoff. | Link sa Item Master Data para makita ang possible stock; huwag ipalagay na kasama ang vendor/PO/payment workflow. |
| **Loss / Damage** | Verify item/control number, evidence, location, at responsible report details; classify Lost/Damaged; record reviewer recommendation at resolution; restrict access. | Verified damage can create/link to To Be Repaired and update condition history; lost item remains an incident/investigation until authorized closure. |
| **Vehicle / Request for Services** | Magdagdag lamang ng queue/form fields matapos makuha ang official form, eligibility, scheduling, at approval rules. | Posibleng vehicle availability calendar; hindi pa final. |

### Approval routing at access

- GSO staff ang magre-review at magpoproseso ayon sa assigned permission.
- Department Head, Property Controller/OIC, GSO Director, o iba pang signatory ay dapat i-map sa totoong school roles at approval sequence bago mag-automate. Nasa paper form ang mga pangalan/posisyon, pero kailangan pa ring kumpirmahin kung pareho ang proseso para sa lahat ng request types.
- Ang requestor ay makakakita lamang ng sariling requests. Ang approver ay makakakita ng requests na naka-assign sa kanya o sa kanyang awtorisadong department.
- Mananatiling hiwalay ang IT Admin oversight at GSO operational decision-making; hindi dapat tahimik na magbago ang admin ng GSO approval o physical inventory record.
- I-audit ang submission, edits, attachments, review, approval/rejection, assignment, issuance/return, work completion, incident resolution, at actor/time/reason.
- Kung kailangan pa ng wet signature, magbigay ng printable/PDF form na may reference number at signature spaces; huwag ipalagay na legal na kapalit nito ang pag-click ng Approve hangga't hindi napagpapasyahan ng paaralan.

### GSO Overview at notifications

Ipakita sa GSO Overview ang real counts at direct links para sa:

- Requests na naghihintay ng review at requests na lampas sa target response time.
- Facility requests sa susunod na araw/linggo at possible schedule conflicts.
- Job requests ayon sa triage, assigned, in progress, at completed.
- Active borrowings, due-soon, overdue, at returns awaiting inspection.
- Purchase requisitions awaiting approval o clarification.
- Open loss/damage incidents at verified repairs.

Ang notifications ay dapat magpaalam sa tamang GSO staff kapag may bagong request o requester reply, at sa requester kapag may decision, schedule, o kailangan siyang kumilos. Iwasan ang duplicate alerts at itala ang delivery/read state kung may ganitong feature.

### Expected GSO outcome

Makakakita ang GSO ng iisang operational entry point para sa incoming forms, ngunit magkakahiwalay ang kanilang queues, reviewers, approval steps, at fulfillment records. Masusundan ng staff ang request mula submission hanggang completion; mababawasan ang pagkawala ng papel at paulit-ulit na follow-up; at makikita ng requester ang malinaw na status. Mananatili sa kasalukuyang inventory/issuance/repair areas ang aktuwal na asset transactions para hindi maghalo ang request approval at physical custody.

## Inirerekomendang implementation order

1. Kumpirmahin ang requestor account types, official form fields, approval roles, at control-number rules.
2. Idisenyo ang Request Center, My Requests, status/event history, access rules, at GSO queue structure.
3. Ikonekta ang Borrowing sa issuance/return; gawin ang Facility Use at Job Request flows para maipakita ang magkakaibang automation.
4. Idagdag ang Facility Calendar at notifications kapag may approved schedule data.
5. Idagdag ang Purchase Requisition at Loss/Damage pagkatapos malinaw ang procurement at incident policies.
6. Idagdag ang Vehicle Permit at Request for Services matapos makuha ang official forms.
7. Palitan ang lahat ng sample dashboard/queue data ng real records bago ipakita bilang live system.
