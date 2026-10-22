# Project Folder Structure

Ito ang kasalukuyang ayos ng mga folder at file sa project, batay sa laman nito ngayon.

> **Mga hindi isinama:** `.git/`, `node_modules/`, at `frontend/dist/` dahil repository metadata, dependencies, o generated build output ang mga ito. Nasa tree ang `backend/.env` bilang local config file lamang; hindi kasama o ipinapakita rito ang mga value nito.

```text
2.Project-Asset/
├── .github/
│   ├── agents/
│   │   └── ginger.agent.md
│   └── docs/
│       ├── BackendArchitecture.md
│       ├── MasterPrompt.md
│       └── styles.md
│
├── backend/
│   ├── database/
│   │   ├── migrations/
│   │   │   ├── 001_initial_schema.sql
│   │   │   ├── 002_email_verification_otp.sql
│   │   │   ├── 003_inventory_items.sql
│   │   │   ├── 004_inventory_categories_and_change_history.sql
│   │   │   ├── 005_inventory_created_audit_action.sql
│   │   │   ├── 006_employees_and_audit_logs.sql
│   │   │   ├── 007_employee_issuance_returns.sql
│   │   │   ├── 008_employee_issuance_batches.sql
│   │   │   ├── 009_employee_issuance_quantities.sql
│   │   │   ├── 010_partial_issuance_returns.sql
│   │   │   ├── 011_employee_middle_name_suffix_picture.sql
│   │   │   └── 012_inventory_item_name.sql
│   │   └── seeds/
│   │       └── 001_initial_seed.sql
│   ├── scripts/
│   │   └── create-admin.js
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js
│   │   │   └── env.js
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js
│   │   │   ├── error.middleware.js
│   │   │   └── role.middleware.js
│   │   ├── modules/
│   │   │   ├── audit/
│   │   │   │   ├── audit.controller.js
│   │   │   │   ├── audit.repository.js
│   │   │   │   ├── audit.routes.js
│   │   │   │   ├── audit.service.js
│   │   │   │   └── audit.validation.js
│   │   │   ├── auth/
│   │   │   │   ├── auth.controller.js
│   │   │   │   ├── auth.repository.js
│   │   │   │   ├── auth.routes.js
│   │   │   │   ├── auth.service.js
│   │   │   │   └── auth.validation.js
│   │   │   ├── departments/
│   │   │   │   ├── departments.controller.js
│   │   │   │   ├── departments.repository.js
│   │   │   │   ├── departments.routes.js
│   │   │   │   ├── departments.service.js
│   │   │   │   └── departments.validation.js
│   │   │   ├── employees/
│   │   │   │   ├── employees.controller.js
│   │   │   │   ├── employees.repository.js
│   │   │   │   ├── employees.routes.js
│   │   │   │   ├── employees.service.js
│   │   │   │   └── employees.validation.js
│   │   │   ├── inventory/
│   │   │   │   ├── inventory.controller.js
│   │   │   │   ├── inventory.repository.js
│   │   │   │   ├── inventory.routes.js
│   │   │   │   ├── inventory.service.js
│   │   │   │   ├── inventory.stock.js
│   │   │   │   └── inventory.validation.js
│   │   │   ├── issuances/
│   │   │   │   ├── issuances.controller.js
│   │   │   │   ├── issuances.repository.js
│   │   │   │   ├── issuances.routes.js
│   │   │   │   ├── issuances.service.js
│   │   │   │   ├── returns.controller.js
│   │   │   │   ├── returns.repository.js
│   │   │   │   └── returns.service.js
│   │   │   └── users/
│   │   │       ├── users.controller.js
│   │   │       ├── users.repository.js
│   │   │       ├── users.routes.js
│   │   │       ├── users.service.js
│   │   │       └── users.validation.js
│   │   └── app.js
│   ├── .env                         # Local settings; values not included here
│   ├── .env.example
│   ├── .gitignore
│   ├── index.js
│   ├── package-lock.json
│   └── package.json
│
├── frontend/
│   ├── public/
│   │   └── dyci_img/
│   │       ├── A.sset.webp
│   │       ├── deployment.png
│   │       ├── dual_logo.jpg
│   │       ├── dyci-logo.webp
│   │       ├── dyci_logo.jpg
│   │       ├── homepage1.jpg
│   │       ├── homepage2.jpg
│   │       ├── homepage3.jpg
│   │       ├── homepage4.jpg
│   │       ├── homepage5.jpg
│   │       ├── homepage6.jpg
│   │       ├── homepage7.jpg
│   │       └── techstack.png
│   ├── src/
│   │   ├── admin/
│   │   │   ├── auditLogsApi.ts
│   │   │   ├── auditlogs.tsx
│   │   │   ├── admindashboard.tsx
│   │   │   ├── userManagementApi.ts
│   │   │   └── usermanagement.tsx
│   │   ├── auth/
│   │   │   ├── authApi.ts
│   │   │   ├── forgotpassword.tsx
│   │   │   ├── login.tsx
│   │   │   ├── register.tsx
│   │   │   ├── resetotp.tsx
│   │   │   ├── resetpassword.tsx
│   │   │   └── verifyemailotp.tsx
│   │   ├── borrowers/
│   │   │   └── borrowerdashboard.tsx
│   │   ├── components/
│   │   │   ├── navbars/
│   │   │   │   ├── adminnavbar.tsx
│   │   │   │   ├── gsonavbar.tsx
│   │   │   │   └── navbar.tsx
│   │   │   └── notifbell/
│   │   │       └── gsonotif.tsx
│   │   ├── gso/
│   │   │   ├── auditTrail.tsx
│   │   │   ├── borrowing.tsx
│   │   │   ├── employeesApi.ts
│   │   │   ├── employemasterdata.tsx
│   │   │   ├── gsodashboard.tsx
│   │   │   ├── inventoryApi.ts
│   │   │   ├── issuanceapproval.tsx
│   │   │   ├── issuancerecord.tsx
│   │   │   ├── issuancesApi.ts
│   │   │   ├── itemsmasterdata.tsx
│   │   │   ├── notifications.tsx
│   │   │   ├── profilesettings.tsx
│   │   │   ├── returnitems.tsx
│   │   │   └── torepaired.tsx
│   │   ├── landing/
│   │   │   ├── about.tsx
│   │   │   ├── contact.tsx
│   │   │   ├── hero.tsx
│   │   │   └── home.tsx
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── .gitignore
│   ├── eslint.config.js
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   ├── README.md
│   ├── tsconfig.app.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
│
├── 123.md
├── deployment.md
├── ForAdmin.md
├── ForBorrowers.md
├── folderhehe.md
├── istallations1.0.md
├── keki.md
└── mobileborrow.md
```

## Mabilis na gabay sa ayos

- **`frontend/`** — kasalukuyang React + TypeScript + Vite web app. Hiwalay ang mga page/features para sa Admin, authentication, Borrower, GSO, at landing pages; nasa `components/` ang shared navigation at notification components.
- **`backend/`** — Node.js + Express API. Nasa `src/modules/` ang feature modules; karaniwang magkakahiwalay ang routes, controllers, services, repositories, at validations. Nasa `database/migrations/` ang SQL schema changes at nasa `database/seeds/` ang initial seed.
- **`backend/scripts/`** — utility scripts, gaya ng paggawa ng admin account.
- **`frontend/public/dyci_img/`** — static image assets na ginagamit ng web app.
- **`.github/`** — project architecture/style notes at agent instructions.
- **Mga `.md` sa project root** — requirements, deployment/installation notes, admin planning, at brainstorming documents.

## Kasalukuyang mobile status

May Borrower dashboard file sa web app at may `mobileborrow.md` na brainstorming notes. **Wala pang React Native app folder** sa kasalukuyang project tree. Kung itutuloy, puwedeng magdagdag ng hiwalay na `mobile/` app folder sa susunod na implementation phase.

> Tree ito ng kasalukuyang files sa project noong ginawa ang dokumentong ito. Maaaring magbago ito kapag may nadagdag o nailipat na files.
