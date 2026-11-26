# A.SSET Master Architecture

**Written for:** ikaw, bilang developer at taga-disenyo ng home page. Ginawa ito mula sa code na nasa repo, kaya kung may magbago sa code, i-update din ang dokumentong ito.

**Ano ang A.SSET:** Asset custody and tracking system ng Dr. Yanga's Colleges, Inc. (DYCI) para sa General Services Office (GSO), IT Administration, at mga requester (faculty at staff). Sinusubaybayan nito ang mga gamit ng paaralan mula sa pagbili, pag-tag, pag-issue, pagbalik, pag-repair, hanggang sa pagbabayad kapag nasira.

---

## 1. Tech stack

| Bahagi | Ano ang gamit |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4 (`@tailwindcss/vite`), ESLint |
| Barcode | `jsbarcode` para sa barcode labels |
| Backend | Node.js, Express, `pg` (PostgreSQL), `bcryptjs`, `nodemailer` (email), `dotenv` |
| Database | PostgreSQL. Neon ang production, local PostgreSQL ang development |
| Hosting | Vercel: isang project para sa frontend, isa para sa backend (`asset-dyci-tan` at `asset-react-backend1`) |
| Source control | GitHub repo `tristan-810324/Asset-React` (branch `main`) |

Ang frontend ay SPA. Ang routing ay nasa `frontend/src/App.tsx` at tinitingnan nito ang `window.location.pathname`. Walang React Router.

---

## 2. Mga portal at roles

Limang role ang nasa system. Bawat role ay may sariling portal at sariling sidebar.

| Role key | Display name | Portal (path) | Sino ito |
| --- | --- | --- | --- |
| `IT_ADMIN` | IT Admin | `/admin/*` | Namamahala ng user accounts, audit, support queue ng ITSS, at repair ng mga IT item |
| `IT_STAFF` | IT Staff | `/itss/*` | Gumagawa ng computer lab at technical jobs (ITSS queue) |
| `GSO_STAFF` | GSO Staff | `/gso/*` | Gumagawa ng pang-araw-araw na GSO: inventory, issuance, returns, repair, payments, requisitions |
| `GSO_HEAD` | GSO Head | `/gso-head/*` | Nagbabantay at nag-a-approve ng requisitions, nagpi-print at nagsa-sign ng dokumento |
| `BORROWER` | Requester | `/requester/*` (alias `/borrower/*`) | Faculty at staff na humihingi ng gamit, serbisyo, o nagre-report ng sira |

**Login redirect** (`frontend/src/auth/authApi.ts`): IT_ADMIN → `/admin`, IT_STAFF → `/itss`, GSO_HEAD → `/gso-head`, BORROWER → `/requester`. Ang GSO_STAFF ay papunta sa `/gso`.

**Mga account na ginagawa ng system:**
- Ang requester account ay nagre-register mismo. Kailangan ng OTP sa email at approval ng GSO (o IT Admin) bago makapag-request.
- Ang staff account ay ginagawa ng IT Admin sa User Management, o ng `scripts/create-admin.js` para sa unang account.

---

## 3. Public site (home page at iba pa)

Ito ang mga pahinang nakikita ng lahat bago mag-login. Ito rin ang target ng pagpapaganda ng home page mo.

| Route | File | Ano ang laman |
| --- | --- | --- |
| `/` | `landing/home.tsx` | Home: hero, features, workflow, about, FAQ, contact |
| `/about` | `about.tsx` | Tungkol sa system |
| `/faq` | `faq.tsx` | Mga tanong at sagot |
| `/contact` | `contact.tsx` | Contact details |
| `/login`, `/register` | `auth/login.tsx`, `auth/register.tsx` | Pag-login at pag-register ng requester |
| `/verify-email` | `auth/verifyemailotp.tsx` | OTP sa email pagkatapos mag-register (countdown ng resend: 20 segundo) |
| `/forgot-password`, `/reset-otp`, `/reset-password` | `auth/*.tsx` | Password reset gamit ang OTP |

**Ang landing navigation** (`landing/navigation.ts`): Home, Features, How it works, About, FAQ, Contact. Ang bawat isa ay may section sa iisang page.

**Ang kasalukuyang nilalaman ng home page:**
- **Hero:** Headline na nagtatapos sa "...easier to manage." (`landing/hero.tsx`)
- **Features** (`landing/features.tsx`): "Equipment records" (organized inventory), "Equipment workflow" (issuance at returns, repair follow-up), "Role-based workspaces" (hiwalay na portal para sa bawat role)
- **How it works** (`landing/workflow.tsx`): Equipment lifecycle sa apat na hakbang: **Record → Issue → Return → Repair**
- **About, FAQ, Contact:** Nasa sariling files

**Ideya para sa home page:**
- Puwedeng ilagay ang dual logo (DYCI at A.SSET) sa hero, at gamitin ang `final_assetlogo.webp` at `dyci-logo.webp` mula sa `frontend/public/dyci_img/`.
- Puwedeng ilagay ang maikling paliwanag ng mga portal, tulad ng ginawa sa Requester Portal.
- Ang kulay ng design system: navy `#09244a` (hero), royal blue `blue-600`/`blue-700`, gold `#f7c948`/`#e9ae1f` (accent), emerald `emerald-600` (success), slate neutrals.

---

## 4. Mga module at ano ang ginagawa ng bawat isa

### 4.1 Authentication (`backend/src/modules/auth`)
- `POST /auth/register`: Gumagawa ng requester account at nagpapadala ng OTP sa email.
- `POST /auth/login`: Nagbibigay ng JWT session. Hindi makakapasok kung hindi verified ang email.
- `POST /auth/verify-email-otp`, `POST /auth/resend-email-verification-otp`: Pag-verify ng email.
- `POST /auth/forgot-password`, `POST /auth/verify-otp`, `POST /auth/reset-password`: Password reset.
- `GET /auth/me`: Kasalukuyang user at mga role.
- Ang JWT ay nilalagyan ng `token_version`, kaya ang pag-deactivate o pag-reset ng account ay nagpapawalang-bisa ng lumang session.

### 4.2 Requester identity (`modules/requester-identity`)
- Bawat requester ay kailangang kumpletuhin ang staff details: employee code, pangalan, department, position, contact number, at larawan.
- `GET/PUT /requester-identity/me`: Ang sariling profile ng requester.
- `GET /requester-identity/reviews`, `GET .../picture`, `PATCH .../reviews/:userId`: Ang review queue. Makikita at magde-decide ang GSO Staff at IT Admin (Verified, Needs Correction, o Rejected).
- Kapag nag-submit ang requester, nagpapadala ng notification sa IT Admin (`/admin/requester-verification`).
- Ang na-verify na requester ay nakakatanggap ng notification na nagsasabi kung sino ang nag-approve (IT Admin o GSO Staff).

### 4.3 Item Master Data at Inventory (`modules/inventory`)
- Mga kategorya at item names ng mga gamit. Bawat item ay may item code sa format na `YYYY-CAT-NNN-UUUU` (migration 011).
- Mga endpoint: `/inventory/categories`, `/inventory/item-names`, `/inventory/items` (listahan, gawa, edit, bulk import, restock).
- `/inventory-counts`: Stock count, para ihambing ang bilang sa system at ang aktuwal.
- Ang bawat item ay may tracking mode: **individual** (bawat unit ay may sariling barcode na `AST-...`) o **quantity** (bilang lang, tulad ng consumables).

### 4.4 Employees at departments (`modules/employees`, `modules/departments`)
- Listahan ng mga empleyado at ang kanilang department at position.
- `/employees/positions` at `/departments`: Master data ng mga position at department. Ginagamit ito sa dropdowns ng requester form at review.

### 4.5 Purchase requisitions (`modules/requests`, `purchase-requisitions`)
Ito ang proseso ng pagbili ng bagong gamit.
- Nagsa-submit ang staff ng purchase requisition na may mga line item.
- GSO Staff ang nagre-review at nagsa-hand over sa Finance (`hand-to-finance`), at may signed PDF (`finance-pdf`).
- GSO Head ang nagdedesisyon at nagsa-sign (`e-signature` module).
- Pagdating ng delivery, ang GSO ang nagli-link ng resibo sa requisition (`deliveries`), nagpapalit ng unit (`swap-unit`), at nagbabalik ng link (`undo`).
- Ang `issuance-queue` ang nagpapakita ng mga item na handa nang i-issue.

### 4.6 Issuance (`modules/issuances`)
Ito ang pag-issue ng item sa tao o kwarto.
- **Batch issuance** (`POST /issuances/batch`): Isang transaksyon para sa maraming item at maraming tatanggap.
- **Approval ng employee** (`/issuances/mine/pending`, `/mine/:batchId/decision`): Ang tatanggap ang nag-a-approve, maliban sa consumables.
- **Handover** (`/batch/:batchId/handover`): Pinal na pag-abot ng item at paglagda ng tatanggap.
- **Labels** (`/labels`, `/labels/print`, `/tags/:tagCode/print`, `/reprint`): Pag-print ng barcode labels. Bawat print ay nakalog.
- **Holdings** (`/holdings`): Kung sino ang may hawak ng ano.
- Ang "Asset Recipient Sheet" (print) ay may columns: Item, Barcode, Assigned to, Location, Received. Walang Purpose column.

### 4.7 Returns at Repair (`modules/issuances` returns, `repair`)
Ito ang pagbalik ng item.
- **Return** (`POST /issuances/returns`, `/tags/:tagCode/return`): Kailangan ng OTP sa email ng employee (`/tags/:tagCode/return-otp`) o confirmation ng GSO staff.
- **Inspection** (`PATCH /tags/:tagCode/inspection`): Kondisyon pagkatapos ng check:
  - **New, Good, o Fair**: Babalik sa stock, sa Item Master Data.
  - **Needs Repair** o **Under Maintenance**: Ipinapasa sa repair.
  - **Unserviceable**: Repair check, at pagkatapos ay write-off.
- **Repair owner**: Pinipili kung GSO o ITSS ang gagawa. Ang ITSS ay nakakatanggap ng notice sa IT Admin.
- **Repaired** (`repair-complete`): Balik sa stock.
- **Written Off** (`POST /returns/:returnId/repair`): Dalawang desisyon:
  - **WAIVED**: Walang bayad. Nakakatanggap ng notice ang requester.
  - **CHARGED**: May estimated na halaga. Lilitaw sa Proof of Settlements at nakakatanggap ng notice ang requester.
- Ang write-off na nanggaling sa IT ay pumapasok din sa Proof of Settlements ng GSO.
- `GET /issuances/repair-history`: Listahan ng lahat ng repair record para sa "To Be Repaired" page.

### 4.8 Charges at Proof of Settlements (`modules/charges`)
Ito ang lahat ng singil sa requester. Tatlong pinagmulan ang charge:
- `FACILITY`: Facility item na nasira o nawala.
- `RETURN`: Returned unit na na-write off.
- `LOSS`: Loss & Damage case na na-charge.

Ang proseso:
1. Ang charge ay "To pay" hanggang may resibo.
2. GSO Staff ang nag-a-upload ng larawan ng resibo at ng halagang binayad (`POST /charges/:kind/:ref/paid`). Ito ang nagpapalit ng status sa **Settled**.
3. Puwede ring i-attach ang waiver proof (PDF o larawan) para sa waived items (`/charges/waivers`, `/:kind/:ref/proof`).
4. Ang requester ay nakakatanggap ng notice: "Payment needed" kapag charged, "Payment is settled" kapag may resibo, at "Damaged item waived" kapag waived.

### 4.9 Loss & Damage (`modules/loss-damage`)
- Nagre-report ang requester ng nawala o nasirang item, may kasamang tag at larawan.
- GSO ang nagre-review (`start-review`), at nagde-desisyon (`decision`): No charge, Charged, For repair, o Resolved.
- Nasa `/gso/loss-damage-cases` ang review, at nasa `/requester/my-requests` ang status ng requester.

### 4.10 Service work orders o Job Requests (`modules/requests` service work orders)
Ito ang mga serbisyo gaya ng ilaw, tubig, muwebles, paglilinis, at IT.
- **Labintatlong kategorya** ng serbisyo, at may team na tumatanggap:
  - GSO Staff: Electrical & Lighting, Plumbing & Water, Furniture & Carpentry, Classroom / Building Repair, Cleaning & Sanitation, Event Setup & Moving, Safety Hazard, Other General Service, Others
  - IT Staff o IT Admin (ITSS): Computer Device, Network & Connectivity, Software & Access, Peripherals & Printing
- **Lifecycle:** Submitted → Claimed → In Progress → Awaiting Requester Confirmation → Closed. Puwede ring Needs Information, Rejected, o Cancelled.
- Ang Priority ay kinukuwenta mula sa target date: Urgent (safety hazard o lampas sa 1 araw), High (3 araw), Standard.
- Auto-close pagkatapos ng 2 araw kapag hindi sinagot ng requester.
- Ang progress update ay may larawan (hanggang 3).

### 4.11 Facility reservations at Facility Use (`modules/facilities`, `facility-options`)
- Nagre-reserve ang requester ng kwarto o venue. Ang venue list ay nasa database at pwedeng i-edit ng GSO.
- Ang approval ay nagre-reserve ng items, may slip na pinapa-print, at may scan para sa release, return, at missing.
- Overdue ay may kaukulang paalala.

### 4.12 Notifications (`modules/notifications`)
- In-app notifications: `GET /notifications/mine`, `POST /mine/:id/read`, `POST /mine/read-all`.
- Dalawang uri: user-specific (`createUserNotification`) at role-based (`createRoleNotification`, na nagpapadala sa lahat ng aktibong account ng role).
- Email: Ginagamit ang SMTP para sa OTP, receipt ng return, at notice ng charge. Hindi ito nagpapatigil ng action kung pumalya.
- May dedupe key para hindi dumoble ang notification.

### 4.13 Audit log at History (`modules/audit`)
- `inventory_change_logs` ang nagtatala ng lahat ng pagbabago: sino, kailan, anong aksyon, at bakit.
- `GET /audit/logs`: Listahan para sa GSO Head at GSO Staff.
- `GET /audit/my-activity`: Sariling aksyon ng IT Admin.
- Ang History page ng bawat portal ay nagpapakita ng sariling listahan, kasama ang activity trail sa popup.

### 4.14 Reports at dashboard
- Ang bawat portal ay may Overview page na may metric cards at listahan ng dapat asikasuhin (Needs your action).
- Ang Operational report ng GSO Head (`/reports/operational`) ay nasa code, pero hindi pa nakakabit sa app (tingnan ang seksyon 9).

### 4.15 E-signature (`modules/signatures`)
- GSO Head ang nag-iimbak ng sariling signature, na ginagamit sa purchase requisition at iba pang dokumento.

### 4.16 Barcode scanner
- Puwedeng i-scan ang barcode ng unit gamit ang USB scanner. Ang component ay `components/scanner/USBScannerMonitor.tsx`.
- Ang `AST-` na barcode ang kinikilala ng system.

---

## 5. Mga uri ng request

Ang `requests` table ay may anim na uri:

| Uri | Gamit | Sino ang nagsa-submit |
| --- | --- | --- |
| `PURCHASE_REQUISITION` | Pagbili ng bagong gamit | Staff |
| `ISSUANCE_REQUEST` | Paghingi ng gamit mula sa stock | Requester |
| `BORROWING` | Paghiram ng gamit | Requester |
| `FACILITY_USE` | Paggamit ng kwarto o venue | Requester |
| `JOB_REQUEST` | Serbisyo at repair ng pasilidad o IT | Requester |
| `LOSS_DAMAGE_REPORT` | Pag-report ng nawala o nasira | Requester |

---

## 6. Mga uri ng notification

Makikita ang mga ito sa `Notifications` page ng bawat portal.

- **Requester:** Approved, Declined, Issued, Returned, Payment needed, Payment settled, Damaged item waived, Account verified, Account needs correction, Account rejected, Service work started, Service work done.
- **GSO Staff at GSO Head:** New requester account to verify, Return recorded, Repair check finished (ITSS), Loss & Damage update, Service request, Purchase requisition update.
- **IT Admin:** New requester account to verify, Unit sent to ITSS for repair check, Repair finished, Service work.

---

## 7. Mga database migration

Lahat ng migration ay nasa `backend/database/migrations/`, at pinapatakbo gamit ang `npm run db:migrate`:

| File | Ano ang idinagdag |
| --- | --- |
| `001_accounts_and_roles.sql` | Users, roles, permissions, user_roles, auth tokens, login events, rate limits |
| `002_people_and_requester_profiles.sql` | Departments, employee positions, employees, requester identity profiles |
| `003_inventory_and_item_master.sql` | Item categories, item names, item catalog, inventory receipts, inventory counts |
| `004_requests_and_audit.sql` | Service requests, request assets, request history, service work orders at tasks, inventory change log (audit) |
| `005_issuances_assets_and_returns.sql` | Employee issuance batches, employee issuances, returns, asset unit tags, return OTPs, label reprints |
| `006_purchase_requisition_workflow.sql` | Purchase requisition lines, line allocations, delivery receipts, item-name policy history |
| `007_platform_support.sql` | App notifications, user signatures, facility options, loss & damage settlements, write-off fields sa returns, numbered items |
| `008_repair_by_name.sql` | `repaired_by_name` sa returns |
| `009_payment_receipts.sql` | Charge receipts (resibo ng bayad) |
| `010_service_work_evidence.sql` | Service work photos at resolution type |
| `011_item_name_code_sequence.sql` | Code sequence para sa item code na `YYYY-CAT-NNN-UUUU` |
| `012_account_edit_flag.sql` | Flag para sa account edit |
| `013_service_work_in_charge.sql` | Link ng service job sa user na may hawak nito (pinalitan ng 014) |
| `014_service_work_in_charge_name.sql` | Pangalan ng taong may hawak ng service job |
| `015_charge_amount_and_waiver_proof.sql` | Waiver proof (PDF o larawan) at amount paid sa resibo |

**Huwag baguhin ang mga nakalapat na migration.** Gumawa ng bagong numbered file para sa anumang pagbabago.

---

## 8. Mga API route (buod)

Lahat ay nasa `/api/v1`. Ang bawat route ay may role check.

| Prefix | Pangunahing gamit |
| --- | --- |
| `/auth` | Register, login, OTP, password reset, `me` |
| `/users` | Pamamahala ng accounts (IT Admin) |
| `/inventory` | Categories, item names, items, restock |
| `/inventory-counts` | Stock count |
| `/employees` | Empleyado at positions |
| `/departments` | Departments |
| `/issuances` | Batch issuance, labels, return, inspection, repair, approvals, holdings, records |
| `/requests` | Requisitions, requests ng requester, service work orders, facility slips, delivery |
| `/requester-identity` | Profile at review ng requester |
| `/notifications` | Notification ng user |
| `/audit` | Audit log at activity |
| `/signatures` | E-signature |
| `/facility-options` | Listahan ng venue |
| `/loss-damage` | Loss & Damage cases |
| `/charges` | Charges, resibo, waiver proof |

Ang buong listahan ng route ay nasa mga file na `backend/src/modules/*/*.routes.js`.

---

## 9. Mga kilalang puwang at limitasyon

Ito ang mga bagay na dapat mong malaman bago mag-deploy o mag-expand:

1. **Shared na password ng bagong account:** Lahat ng account na ginawa sa User Management ay may `Admin123` bilang default, at walang change-password screen. Kapag nasa internet na ang site, dapat ayusin ito.
2. **Demo accounts sa seed file:** Ang `backend/database/seeds/001_initial_seed.sql` ay may demo accounts na may `Admin123`. Hindi ito tinatakbo sa fresh na database, pero huwag itong patakbuhin sa production.
3. **Mga module na hindi nakakabit sa `app.js`:** Ang `dashboard`, `facilities`, `admin`, at `reports` ay nasa folder, pero wala sa listahan ng `app.use(...)` sa `backend/src/app.js`. Kaya ang mga endpoint na tinatawag ng frontend tulad ng `/admin/*` at `/reports/operational` ay hindi gagana hanggang maikabit ang mga ito.
4. **Mga lumang notification** na nagawa bago ang mga pagbabago ay may link pa sa `/requester` o sa lumang path.
5. **Mga limitasyon ng Vercel at Neon:** Libre ang plan. Nagsa-sleep ang Neon kapag walang gamit, kaya mas mabagal ang unang request. Ang response ng isang function ay hanggang 4.5 MB.
6. **Expiry ng pending records:** Tumatakbo ito kapag may dumating na request, hindi sa sariling oras.
7. **Mga test:** Kailangan ng `TEST_DATABASE_URL` na malinis na database para tumakbo ang buong test suite. Kung wala ito, lumalaktaw ang mga database test.

---

## 10. Environment variables

**Backend** (`backend/.env` sa local, at Environment Variables sa Vercel):

| Pangalan | Kailangan | Ano ang gamit |
| --- | --- | --- |
| `DATABASE_URL` | Oo | Connection string ng PostgreSQL (pooled sa Vercel) |
| `JWT_SECRET` | Oo | Sikreto para sa JWT |
| `FRONTEND_ORIGIN` | Oo sa Vercel | Eksaktong address ng frontend, para sa CORS |
| `FRONTEND_URL` | Hindi | Address na ginagamit sa mga link ng email |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Para sa email | Gmail SMTP (`smtp.gmail.com`, `587`, App Password) |
| `TZ` | Hindi | Dapat `Asia/Manila` |

**Frontend:**

| Pangalan | Ano ang gamit |
| --- | --- |
| `VITE_API_BASE_URL` | Address ng backend, kasama ang `/api/v1` |

**Para sa migration:**

| Pangalan | Ano ang gamit |
| --- | --- |
| `MIGRATION_DATABASE_URL` | Direct connection string (walang `-pooler`), para sa `npm run db:migrate` |

---

## 11. Mga script

**Backend** (`backend/package.json`):
- `npm run dev`: Nodemon, pang-development.
- `npm start`: Pang-production (`node index.js`).
- `npm run db:migrate`: Patakbuhin ang lahat ng migration na hindi pa nakalapat.
- `npm test`: Patakbuhin ang mga test sa `backend/tests/`.
- `node scripts/create-admin.js` at `node scripts/create-admin.js --gso`: Gumawa ng unang IT Admin at GSO Staff.

**Frontend:**
- `npm run dev`: Vite dev server.
- `npm run build`: Type check at build.
- `npm run lint`: ESLint.

---

## 12. Deployment

- **Frontend:** Vercel project `asset-dyci-tan`, Root Directory `frontend`.
- **Backend:** Vercel project `asset-react-backend1`, Root Directory `backend`. Ang `backend/src/app.js` ang tinatakbo ng Vercel, hindi ang `index.js`.
- **Database:** Neon, project `project-asset`, branch `production`, database `neondb`.
- Tingnan ang `deployment-vercel.md` para sa buong hakbang.

---

## 13. Paano i-update ang dokumentong ito

- Kapag nagdagdag ka ng module o route, idagdag ito sa seksyon 4 at 8.
- Kapag may bagong migration, idagdag sa seksyon 7.
- Kapag may bagong role o portal, idagdag sa seksyon 2.
- Kapag nagbago ang home page, i-update ang seksyon 3.
