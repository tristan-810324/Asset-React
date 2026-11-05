# PERN Deployment Practice Guide

Gabay ito para mag-rehearse ng deployment gamit ang parehong providers:

```text
Vercel (React/Vite frontend)
        |
        | HTTPS requests
        v
Render (Express API) ---- Neon (PostgreSQL)
        |
        +---- Gmail SMTP (OTP email)
```

Para sa practice, gumawa ng magkakahiwalay na **practice Vercel project**, **practice Render service**, at **practice Neon database/branch**. Huwag ikonekta ang practice service sa production database o production secrets.

## 1. Importanteng database checkpoint bago mag-full deploy

Nasa [backend/database/README.md](./backend/database/README.md) ang migration catalog. Ang checked-in migrations ay `001` hanggang `028`, wala pang migration runner o migration ledger, at hindi sapat ang mga migration na iyon para sa lahat ng schema na ginagamit ng kasalukuyang backend.

Ayon sa audit notes ng database README, may mga ginagamit na object na wala sa checked-in migrations:

- Tables: `asset_movements` at `app_notifications`
- `item_catalog.lifecycle_status` at `item_catalog.reorder_level`
- `service_requests.external_forwarded_at`, `external_forwarded_to`, at `external_reference`

Bago asahang gagana ang buong app, kailangang ihanda at i-test ang schema reconciliation migration sa disposable database. Huwag basta i-run ang lahat ng SQL sa existing database at huwag mag-delete o mag-reset ng production database. Basahin muna ang migration notes at tiyaking alam kung alin na ang na-apply.

Puwede pa ring i-rehearse ang provider setup at database connection sa practice environment. Tandaan na ang `/api/v1/health` ay sumusubok lang ng koneksyon sa PostgreSQL; hindi nito tinitiyak na kumpleto ang schema para sa bawat feature.

> **Seed warning:** Ang `backend/database/seeds/001_initial_seed.sql` ay para sa disposable/local database. May demo accounts ito at nire-reset nito ang seeded credentials kapag ni-run ulit. Huwag itong patakbuhin sa production.

## 2. Ihanda ang ligtas na practice environment

1. Gumamit ng reviewed, non-production Git branch gaya ng `deploy-practice`.
2. Gumawa ng hiwalay na practice Neon database o branch.
3. Gumawa ng hiwalay na practice Render Web Service na naka-connect sa practice branch.
4. Gumawa ng hiwalay na Vercel project para sa practice branch, o gumamit ng Preview deployment.
5. Gumamit ng test account at test email. Huwag maglagay ng totoong user data sa practice database.

Kung gagawa ka ng practice branch mula sa kasalukuyang branch, tiyaking na-review muna ang mga pagbabago at walang secret na masasama:

```powershell
git status --short
git branch --show-current
git switch -c deploy-practice
git push -u origin deploy-practice
```

Kung mayroon nang `deploy-practice` branch, lumipat doon gamit ang `git switch deploy-practice` sa halip na gumawa ulit ng branch.

## 3. Local preflight sa Windows PowerShell

Buksan ang terminal sa project root:

```powershell
Set-Location "C:\React-Projects\2.Project-Asset"
node --version
git status --short
git diff --cached --name-only
```

Ang Vite version sa frontend lockfile ay nangangailangan ng Node.js `20.19+` o `22.12+`. Gumamit ng magkatugmang Node version sa local build at deployment services; ang Node.js 22.12+ o 24.x ay pasok sa requirement na iyon.

Huwag i-commit ang `backend/.env`. Ang backend `.gitignore` ay nagbubukod ng `.env` files. I-commit lang ang `.env.example`, na walang totoong credentials. Huwag gumamit ng `git add .` nang hindi muna nire-review ang staged files.

### Frontend build check

```powershell
Set-Location "C:\React-Projects\2.Project-Asset\frontend"
npm ci
npm run lint
npm run build
```

Dapat gumawa ang Vite ng `frontend/dist/`. Build output ito; Vercel ang gagawa nito sa deployment.

### Backend startup at health check

Sa backend, gumawa ng local `.env` mula sa example kung wala pa, pagkatapos ay ilagay ang local database URL at local secrets:

```powershell
Set-Location "C:\React-Projects\2.Project-Asset\backend"
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
npm start
```

Habang bukas ang backend terminal, buksan ang pangalawang terminal at subukan:

```powershell
Invoke-RestMethod http://localhost:5000/api/v1/health
```

Dapat may `success: true`, `status: ok`, at `database: connected`. Ihinto ang local server gamit ang `Ctrl+C` pagkatapos mag-test.

Wala pang aktuwal na backend test suite ang `backend/package.json`; placeholder ang `npm test`. Gamitin ang startup, health endpoint, at smoke tests sa ibaba bilang practice checks.

## 4. Ihanda ang Neon PostgreSQL practice database

1. Gumawa ng hiwalay na Neon project o branch para sa practice.
2. Buksan ang **Connect** dialog at piliin ang tamang branch, database, at role.
3. Para sa Render runtime, gamitin ang pooled connection string na may `-pooler` sa hostname at `sslmode=require`.
4. Para sa SQL migration work o database administration, gamitin ang Neon SQL Editor o direct connection string kung kailangan.
5. Panatilihing pribado ang buong connection string; kasama rito ang database password.

Walang automatic migration command sa project. Bago mag-apply ng SQL:

1. Basahin ang [migration catalog](./backend/database/README.md) at tingnan ang [backend/database/migrations/](./backend/database/migrations/).
2. Sa bagong disposable database lang i-rehearse ang migration sequence. Sa kasalukuyang repo, sundin ang numeric order mula `001` hanggang `028`, at idagdag ang na-review na schema reconciliation migration bago mag-full app test.
3. Itala kung aling migration ang matagumpay na na-apply. Walang migration ledger na awtomatikong magtatala nito.
4. Huwag i-replay ang migration directory sa existing o production database nang hindi muna tinitiyak ang live schema at migration history.
5. Gamitin ang seed file sa disposable practice database lamang, hindi sa production.

## 5. I-deploy ang practice backend sa Render

Gumawa ng **Web Service** mula sa GitHub repository. Piliin ang practice branch at itakda:

```text
Root Directory: backend
Runtime: Node
Build Command: npm ci
Start Command: npm start
Health Check Path: /api/v1/health
Node version: 22.12+ o 24.x
```

Huwag magtakda ng fixed `PORT=5000` sa Render. Ginagamit ng backend ang `process.env.PORT` kapag ibinigay ito ng host, at `5000` lang ang local default.

Idagdag ang environment variables sa Render service dashboard:

```text
NODE_ENV=production
FRONTEND_ORIGIN=https://YOUR-PRACTICE-VERCEL-ORIGIN
DATABASE_URL=YOUR-NEON-PRACTICE-POOLED-CONNECTION-STRING
JWT_SECRET=YOUR-LONG-RANDOM-SECRET
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-test-email@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM=your-test-email@gmail.com
```

Mga paalala:

- Dapat hindi bababa sa 32 characters ang `JWT_SECRET`; gumawa ng random secret at huwag i-reuse ang database password.
- I-set ang `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, at `SMTP_PASS` bilang kumpletong grupo, o iwanang lahat na walang laman. Mag-e-error ang backend kapag ilan lang ang na-set. Optional ang `SMTP_FROM`; kung wala ito, gagamitin ang `SMTP_USER`.
- Para sa Gmail SMTP, kailangan ang Google App Password kapag available sa account; nangangailangan ito ng 2-Step Verification. Huwag ilagay ang normal Gmail password.
- Huwag gumawa o mag-upload ng production `.env` file sa repository. Ilagay ang secrets sa Render dashboard.
- Iwanang walang pre-deploy migration command habang wala pang ligtas at nasubukang migration runner.

Pagkatapos ng deploy, subukan ang backend URL:

```text
https://YOUR-RENDER-SERVICE.onrender.com/api/v1/health
```

Dapat magbalik ito ng `status: ok` at `database: connected`. Kung wala pang Vercel origin, puwedeng pansamantalang placeholder ang `FRONTEND_ORIGIN` habang health check lang ang ginagawa. I-update ito bago subukan ang browser app.

## 6. I-configure at i-deploy ang frontend sa Vercel

### SPA route rewrite

Gumagamit ang frontend ng path-based routes tulad ng `/login`, `/admin`, at `/gso/items`. Para gumana ang direct link at refresh sa mga path na ito, gumawa ng `frontend/vercel.json` na may:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

Nasa project root ang file na ito kapag `frontend` ang Vercel Root Directory.

### Vercel project settings

Gumawa ng hiwalay na practice project na konektado sa practice branch, pagkatapos itakda:

```text
Root Directory: frontend
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Node.js: 22.12+ o 24.x
```

Puwedeng hayaang awtomatikong ma-detect ni Vercel ang install command mula sa `frontend/package-lock.json`. Kung magse-set ka ng override, gamitin ang `npm ci`.

Sa **Settings → Environment Variables**, idagdag ang sumusunod para sa **Preview** environment ng practice project:

```text
VITE_API_BASE_URL=https://YOUR-PRACTICE-RENDER-SERVICE.onrender.com/api/v1
```

I-set ang kaukulang backend URL nang hiwalay para sa Production environment kapag handa ka nang mag-release. Ang `VITE_` variables ay napupunta sa browser bundle; huwag maglagay rito ng password, database URL, o JWT secret.

Pagkatapos mag-deploy, tandaan ang eksaktong Vercel origin, halimbawa:

```text
https://your-practice-project-git-deploy-practice.vercel.app
```

## 7. Itugma ang CORS at subukan ang app

Sa Render, palitan ang `FRONTEND_ORIGIN` ng eksaktong practice Vercel origin. Walang path o trailing slash:

```text
Tama:  https://your-practice-project.vercel.app
Iwasan: https://your-practice-project.vercel.app/
```

Pagkatapos baguhin ang variable, i-redeploy o i-restart ang practice Render service. Kung nag-iiba ang Vercel Preview URL, i-update din ang `FRONTEND_ORIGIN` para tumugma sa URL na sinusubukan.

Gawin ang mga smoke test na ito sa practice deployment:

- [ ] Gumagana ang `/api/v1/health` at nakakonekta sa practice Neon database.
- [ ] Naglo-load ang homepage at login page.
- [ ] Gumagana ang direct open at refresh sa `/login`, `/admin`, at `/gso/items`.
- [ ] Naka-configure ang frontend API URL sa practice Render service, hindi sa `localhost`.
- [ ] Walang CORS o failed API request sa browser developer console.
- [ ] Naka-test ang login at role access gamit ang practice accounts.
- [ ] Na-test ang OTP email kung naka-configure ang SMTP.
- [ ] Na-test ang pangunahing GSO workflows kapag kumpleto na ang database schema.

Ang initial admin account ay gawin gamit ang `backend/scripts/create-admin.js` pagkatapos maihanda ang schema at roles. Tiyaking nakaturo ang `DATABASE_URL` sa tamang practice database bago patakbuhin. Huwag gamitin ang seeded demo credentials sa production.

## 8. Production release checklist

Huwag ilipat sa production hangga't hindi pumapasa ang practice deployment at nalulutas ang migration/schema checkpoint sa Section 1.

- [ ] Na-review at na-commit ang kinakailangang schema reconciliation migration.
- [ ] Nasubukan ang migration sa disposable database at may backup/restore plan para sa production data.
- [ ] Naka-set ang Render production service sa tamang branch at production Neon connection string.
- [ ] Naka-set ang Vercel Production `VITE_API_BASE_URL` sa production API.
- [ ] Eksaktong production frontend origin ang `FRONTEND_ORIGIN`.
- [ ] Na-configure ang production `JWT_SECRET` at SMTP credentials sa provider dashboards.
- [ ] Walang `backend/.env`, test credentials, o database URL sa staged/committed files.
- [ ] Hindi ni-run ang `001_initial_seed.sql` sa production.
- [ ] Na-test ang health endpoint at mahahalagang user workflows pagkatapos ng deploy.
- [ ] Na-save ang deployment URL, commit, at oras ng release para sa rollback reference.

Kung pumalya ang bagong app deploy, ibalik sa huling matagumpay na application deployment sa provider dashboard o mag-deploy muli mula sa huling reviewed commit. Hiwalay ang database changes sa app rollback; huwag basta i-reverse o burahin ang schema/data. I-restore ang database mula sa backup kung kailangan at ayon sa na-verify na recovery plan.

## 9. Karaniwang problema

| Sintomas | Suriin |
| --- | --- |
| Vercel build error tungkol sa Node version | Gumamit ng Node `22.12+` o `24.x`; i-check din ang install/build logs. |
| Frontend requests to `localhost:5000` | Itakda ang `VITE_API_BASE_URL` sa Preview o Production environment at gumawa ng bagong deployment. |
| Browser CORS error | Itugma ang eksaktong browser origin sa Render `FRONTEND_ORIGIN`, kabilang ang `https://` at hostname. |
| 404 sa refresh ng `/admin` o `/gso/items` | Tiyaking nasa `frontend/vercel.json` ang SPA rewrite at nasa `frontend` ang Vercel Root Directory. |
| Render startup error na missing `DATABASE_URL` o `JWT_SECRET` | Itakda ang required variables sa Render dashboard at i-redeploy. |
| Health check fails sa database | Suriin ang Neon connection string, `sslmode=require`, database status, at credentials. |
| Health green pero may 500 sa feature/API | Maaaring wala sa database ang kinakailangang table o column. Ihambing ang live schema sa migration catalog; huwag magpatakbo ng random SQL sa production. |
| Hindi nagpapadala ang OTP email | Tiyaking kumpleto ang apat na SMTP variables at tama ang Gmail App Password. |

## 10. Official references

- [Vercel: Vite deployments at SPA deep links](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel: build configuration at root directory](https://vercel.com/docs/builds/configure-a-build)
- [Render: Web Services](https://render.com/docs/web-services)
- [Render: pagpili ng Node.js version](https://render.com/docs/node-version)
- [Neon: connection pooling](https://neon.tech/docs/connect/connection-pooling)
- [Google: gumawa at gumamit ng App Password](https://support.google.com/accounts/answer/185833)
