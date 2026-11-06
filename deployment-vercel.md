# Deployment sa Vercel at Neon

```text
Browser ──> Vercel project 1: frontend (React/Vite)
   │
   └─────> Vercel project 2: backend (Express) ──> Neon (PostgreSQL)
                                  └──────────────> Gmail SMTP (OTP at issuance email)
```

Handa na ang code para dito. Ang natitira ay ang mga hakbang na nangangailangan ng sarili mong Vercel, Neon, at Gmail accounts. Sundin ang pagkakasunod-sunod.

## 1. I-commit at i-push ang code

Sa Git kumukuha ng code ang Vercel. Tiyaking wala ang `backend/.env` sa listahan bago mag-commit:

```powershell
Set-Location "C:\React-Projects\2.Project-Asset"
git status --short
```

## 2. Gumawa ng Neon database

1. Gumawa ng project sa [Neon](https://console.neon.tech). Piliin ang **Postgres 18**, na kapareho ng local mo, at ang region na **AWS Asia Pacific (Singapore)**.
2. Sa **Connect**, kopyahin ang dalawang connection string:
   - **Direct** (walang `-pooler` sa host): para sa migrations at sa pagkopya ng data.
   - **Pooled** (may `-pooler` sa host): para sa Vercel.

May password ang mga string na ito. Huwag i-commit o i-paste sa chat.

## 3. Ihanda ang laman ng database

Pumili ng isa. **Option A ang inirerekomenda** kung test data lang ang nasa local mo.

### Option A: bagong database

Gawin ito sa iisang PowerShell window. Ang `Read-Host` ay para hindi mapunta ang password sa command history.

```powershell
Set-Location "C:\React-Projects\2.Project-Asset\backend"
npm ci

$env:MIGRATION_DATABASE_URL = Read-Host "I-paste ang DIRECT connection string"
npm run db:migrate

# Gagamitin ng create-admin ang DATABASE_URL na ito sa halip na ang nasa backend/.env.
$env:DATABASE_URL = $env:MIGRATION_DATABASE_URL
node scripts/create-admin.js        # unang IT Admin
node scripts/create-admin.js --gso  # unang GSO Staff

Remove-Item Env:MIGRATION_DATABASE_URL, Env:DATABASE_URL
```

Kailangan ang dalawang account dahil walang position na mapipili sa User Management sa bagong database. Ang position ng dalawang ito ang unang lalabas sa listahan. Pagkatapos, makakagawa na ang GSO Staff ng employees at ang IT Admin ng iba pang account.

### Option B: kopyahin ang local data

```powershell
Set-Location "C:\React-Projects\2.Project-Asset\backend"
npm ci

$pg = "C:\Program Files\PostgreSQL\18\bin"
$dump = "$env:TEMP\dyci-local.dump"
& "$pg\pg_dump.exe" --format=custom --no-owner --no-privileges --host=localhost --username=postgres --dbname=dyci_gso --file=$dump

$env:MIGRATION_DATABASE_URL = Read-Host "I-paste ang DIRECT connection string"
& "$pg\pg_restore.exe" --no-owner --no-privileges --dbname=$env:MIGRATION_DATABASE_URL $dump
npm run db:migrate -- --baseline=028

$env:DATABASE_URL = $env:MIGRATION_DATABASE_URL
node scripts/create-admin.js        # bagong IT Admin
node scripts/create-admin.js --gso  # bagong GSO Staff

Remove-Item Env:MIGRATION_DATABASE_URL, Env:DATABASE_URL
Remove-Item $dump
```

> **Mahalaga:** Kasama sa kopya ang apat na demo account na `Admin123` ang password, at mabubuksan ang mga ito sa internet. I-disable ang mga ito sa Neon **SQL Editor**, pagkatapos gawin ang bago mong IT Admin at GSO Staff:
>
> ```sql
> UPDATE users SET is_active = FALSE
>  WHERE lower(email) IN ('admin@dyci.edu.ph', 'itstaff@dyci.edu.ph', 'gso@dyci.edu.ph', 'borrow@dyci.edu.ph');
> ```

### I-check ang database

Sa Neon SQL Editor, dapat `Asia/Manila` ang sagot nito:

```sql
SHOW timezone;
```

## 4. I-deploy ang backend

Sa Vercel, **Add New → Project**, piliin ang repository, at itakda ang **Root Directory** sa `backend`.

Idagdag sa **Environment Variables**:

| Pangalan | Halaga |
| --- | --- |
| `DATABASE_URL` | Ang **pooled** connection string ng Neon |
| `JWT_SECRET` | Bagong random na value (tingnan sa ibaba) |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Gmail address na magpapadala |
| `SMTP_PASS` | Gmail App Password, hindi ang normal na password |
| `SMTP_FROM` | Kapareho ng `SMTP_USER` |

Gumawa ng `JWT_SECRET` at huwag gamitin ang nasa local mo:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Huwag i-set ang `PORT` at `TZ`. Hayaang naka-check ang **Automatically expose System Environment Variables**, dahil ito ang nagsasabi sa app na nasa Vercel ito.

Pagkatapos ng deploy, buksan ang address na ito. Dapat lumabas ang `"database":"connected"`:

```text
https://YOUR-BACKEND.vercel.app/api/v1/health
```

## 5. I-deploy ang frontend

Gumawa ulit ng **bagong project** mula sa parehong repository, na ang **Root Directory** ay `frontend`.

| Pangalan | Halaga |
| --- | --- |
| `VITE_API_BASE_URL` | `https://YOUR-BACKEND.vercel.app/api/v1` |

Kapag wala o mali ang format nito, sadyang hihinto ang build na may malinaw na error, para hindi ma-deploy ang site na tumatawag sa `localhost`.

## 6. Ikonekta ang backend sa frontend

1. Sa backend project, idagdag ang `FRONTEND_ORIGIN` na may eksaktong address ng frontend, halimbawa `https://YOUR-FRONTEND.vercel.app`. Kung higit sa isa ang address, paghiwalayin ng comma.
2. **I-redeploy ang backend.** Sa bagong deployment lang gumagana ang binagong environment variable. Ganoon din sa frontend kapag binago ang `VITE_API_BASE_URL`.

## 7. I-test

- [ ] Nakakapag-login ang IT Admin at GSO Staff.
- [ ] Gumagana ang refresh sa `/gso/items` at `/gso/requester-verification`.
- [ ] Nakakatanggap ng OTP email ang bagong registered na requester.
- [ ] Nakakapag-issue at nakakapag-return ng item, at tama ang oras na ipinapakita (Philippine time).
- [ ] Lumalabas ang pictures sa Requester Verifications.

## Pag-maintain

- **Bagong migration:** Gumawa ng bagong numbered file, tapos patakbuhin ang `npm run db:migrate` gamit ang direct connection string **bago** i-deploy ang code na gumagamit nito.
- **Custom domain:** Idagdag ito sa `FRONTEND_ORIGIN` at i-redeploy ang backend.
- **Local development:** Walang nagbago. `npm run dev` pa rin, at binabasa pa rin ang `backend/.env`.

## Mga limitasyon

- **Shared na initial password:** Lahat ng account na ginawa sa User Management ay `Admin123` ang password, at walang change-password screen. Kapag nasa internet na ang site, ipagamit agad sa bawat user ang **Forgot password** pagkatapos ng unang login, dahil kahit sino na may alam ng email nila ay makakapasok gamit ang password na iyon.
- **Vercel Hobby:** Libre, pero para sa personal at non-commercial na gamit lang ayon sa kanilang patakaran. Kung gagamitin ito ng opisina o paaralan, tingnan kung kailangan ng Pro.
- **Neon Free:** 1 GB bawat project at 100 compute hours bawat buwan. Natutulog ito pagkatapos ng 5 minuto na walang gamit, kaya medyo mas mabagal ang unang request.
- **Laki ng response:** Hanggang 4.5 MB ang response ng isang Vercel function ayon sa docs nila. Binubuo ng `GET /inventory/items` ang buong listahan sa isang response, na mga 1.2 KB bawat item sa kasalukuyang data, kaya bantayan ito kapag umabot na sa ilang libong item.
- **Expiry ng pending records:** Tumatakbo ito kapag may dumating na request, hindi sa sariling oras. Hindi ito nakakaapekto sa nakikita ng user, dahil nauuna ang cleanup bago sagutin ang request.

## Karaniwang problema

| Sintomas | Suriin |
| --- | --- |
| Build error tungkol sa `VITE_API_BASE_URL` | I-set ito sa frontend project gaya ng nasa step 5, tapos mag-redeploy. |
| CORS error sa browser console | Eksaktong address ba ang `FRONTEND_ORIGIN`, at na-redeploy ba ang backend? |
| HTML login page ng Vercel ang sagot ng API | Gamitin ang maikling production address, hindi ang mahabang address ng isang deployment. |
| Mali nang 8 oras ang oras | Dapat `Asia/Manila` ang `SHOW timezone;`. Kung bago lang ito na-set, i-restart ang compute sa Neon. |
| `This database already has tables but no migration ledger` | May laman na ang database. Gamitin ang `--baseline`, gaya ng Option B. Walang nabago sa database. |
| `Use the direct Neon connection string` | Pooled string ang nailagay. Gamitin ang walang `-pooler`. |
| 500 error sa API | Tingnan ang **Logs** ng backend project. Nakalagay doon ang path at error code. |
| Hindi dumarating ang OTP email | Tama ba ang apat na `SMTP_*`, at App Password ba ang `SMTP_PASS`? |
| `SECURITY WARNING: The SSL modes...` sa logs | Normal ito sa `sslmode=require` ng Neon at hindi ito error. |
