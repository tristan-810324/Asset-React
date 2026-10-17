# A.SSET — Pag-install sa Ibang Laptop gamit ang ZIP

> Gabay ito para ma-download ang project mula sa GitHub, maihanda sa Windows laptop, at mapatakbo nang lokal sa VS Code. Hindi kasama rito ang pagbabago sa application code.

> Source code lang ang laman ng ZIP. Hindi kasama rito ang local PostgreSQL data o `backend/.env`; kailangang gumawa ng sariling local database at `.env` sa bawat laptop.

## 1. Ihanda ang mga kailangan

I-install muna ang mga sumusunod sa bagong laptop:

- **Node.js 22 LTS** (kasama na ang npm).
- **PostgreSQL 16 o mas bago**. Puwedeng isama ang pgAdmin sa installation para mas madaling gumawa ng database. Tandaan ang password ng `postgres` account na gagawin sa installer; karaniwang port ang `5432`.
- **Visual Studio Code**.

Pagkatapos mag-install ng Node.js, buksan ang PowerShell terminal at tingnan kung gumagana:

```powershell
node --version
npm --version
```

## 2. I-download ang ZIP mula sa GitHub

1. Buksan ang [A.SSET GitHub repository](https://github.com/tristan-810324/Asset-React).
2. Piliin ang branch na **main** kung iba ang ipinapakita.
3. I-click ang berdeng **Code** button.
4. Piliin ang **Download ZIP**.
5. Pagkatapos ma-download, i-right-click ang ZIP at piliin ang **Extract All...**.
6. Piliin ang lokasyon kung saan ise-save ang project at i-click ang **Extract**.

Huwag patakbuhin ang commands habang nasa loob pa ng ZIP preview. Gamitin ang na-extract na folder na may `backend` at `frontend` na subfolder.

## 3. Buksan ang project sa VS Code

1. Buksan ang VS Code.
2. Piliin ang **File → Open Folder...**.
3. Piliin ang na-extract na project folder na naglalaman ng `backend` at `frontend`.
4. Piliin ang **Terminal → New Terminal**. Tiyaking ang terminal ay nasa project root folder.

## 4. I-install ang project dependencies

Walang `package.json` sa project root, kaya hiwalay na i-install ang dependencies ng `backend` at `frontend`. Magsimula sa project root sa VS Code PowerShell terminal:

```powershell
Set-Location .\backend
npm ci
Set-Location ..
```

Pagkatapos, i-install ang frontend dependencies:

```powershell
Set-Location .\frontend
npm ci
Set-Location ..
```

Hintaying matapos ang parehong `npm ci` bago magpatuloy. Kailangan ng internet habang dina-download ang packages.

## 5. Gumawa ng PostgreSQL database

Gamit ang **pgAdmin**:

1. Buksan ang pgAdmin at kumonekta sa lokal na PostgreSQL server.
2. I-expand ang server, i-right-click ang **Databases**, at piliin ang **Create → Database...**.
3. Ilagay ang `dyci_gso` bilang database name.
4. Piliin ang `postgres` bilang owner kung iyon ang account na gagamitin mo sa local setup.
5. I-click ang **Save**.

Kung naka-install at nasa PATH ang `psql`, puwede ring gawin ito mula sa PowerShell:

```powershell
psql -U postgres -d postgres -c "CREATE DATABASE dyci_gso;"
```

Kung mayroon nang database na `dyci_gso`, huwag itong likhain ulit.

## 6. Patakbuhin ang database migrations at seed

Patakbuhin ang mga sumusunod mula sa **project root**, isa-isa at sa ganitong pagkakasunod-sunod. Ilagay ang password ng PostgreSQL kapag hiningi:

```powershell
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\migrations\001_initial_schema.sql
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\migrations\002_email_verification_otp.sql
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\migrations\003_inventory_items.sql
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\migrations\004_inventory_categories_and_change_history.sql
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\migrations\005_inventory_created_audit_action.sql
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\migrations\006_employees_and_audit_logs.sql
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\migrations\007_employee_issuance_returns.sql
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\migrations\008_employee_issuance_batches.sql
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\migrations\009_employee_issuance_quantities.sql
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\migrations\010_partial_issuance_returns.sql
psql -U postgres -d dyci_gso -v ON_ERROR_STOP=1 -f .\backend\database\seeds\001_initial_seed.sql
```

Mahalaga ang pagkakasunod-sunod: kailangang mauna ang migrations `001` hanggang `009` bago ang `010_partial_issuance_returns.sql`. Patakbuhin ang seed pagkatapos ng lahat ng migrations.

Kung lumabas ang error na `psql is not recognized`, buksan ang pgAdmin **Query Tool** para sa `dyci_gso` at patakbuhin ang laman ng bawat SQL file nang paisa-isa, ayon sa parehong pagkakasunod-sunod sa itaas. Karaniwang nasa `C:\Program Files\PostgreSQL\<version>\bin\` ang `psql.exe`; maaari ring idagdag ang folder na iyon sa Windows PATH.

Sa pgAdmin, piliin ang `dyci_gso`, buksan ang **Query Tool**, gamitin ang **Open File** para buksan ang unang `.sql` file, at i-click ang **Execute** (o pindutin ang F5). Ulitin ito sa bawat migration at sa seed file sa pagkakasunod-sunod sa itaas.

## 7. Gumawa at i-configure ang `backend/.env`

> Ang `.env` ay local configuration file at hindi kasama kapag hindi ito na-commit sa GitHub. Huwag gamitin o ipadala ang `.env` ng ibang tao; ilagay ang sariling database password at secret.

Sa PowerShell:

```powershell
Set-Location .\backend
Copy-Item .env.example .env
```

Buksan ang `backend/.env` sa VS Code at itama ang mga value para sa laptop na ito. Halimbawa:

```dotenv
NODE_ENV=development
PORT=5000
FRONTEND_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/dyci_gso
JWT_SECRET=PASTE_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

- Palitan ang `YOUR_POSTGRES_PASSWORD` ng password ng local PostgreSQL account. Kung may espesyal na character gaya ng `@` sa password, i-URL-encode ito sa connection string; halimbawa, `@` ay `%40`.
- Palitan ang `JWT_SECRET` ng sariling random na value na hindi bababa sa 32 character. Puwedeng gumawa ng value sa PowerShell gamit ang `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"` at kopyahin ang resulta.
- Puwedeng iwanang blangko ang lahat ng `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, at `SMTP_PASS` para sa local testing gamit ang mga account na verified na. Kailangang punan ang apat kung gagamit ng email OTP. Para sa Gmail, gumamit ng Google App Password, hindi ang karaniwang Gmail password.

Hindi kailangang gumawa ng hiwalay na `frontend/.env` para sa local setup; default na kumokonekta ang frontend sa `http://localhost:5000/api/v1`.

Pagkatapos mag-edit, bumalik sa project root:

```powershell
Set-Location ..
```

## 8. Paandarin ang backend

Sa unang VS Code terminal:

```powershell
Set-Location .\backend
npm run dev
```

Iwanang bukas ang terminal habang ginagamit ang app. Suriin ang backend sa browser sa [http://localhost:5000/api/v1/health](http://localhost:5000/api/v1/health). Dapat magpakita ito ng `"status":"ok"` at `"database":"connected"`.

## 9. Paandarin ang frontend

Magbukas ng **ikalawang terminal** sa VS Code, siguraduhing nasa project root, at patakbuhin:

```powershell
Set-Location .\frontend
npm run dev
```

Buksan ang address na ibinigay ng Vite terminal; karaniwan ay [http://localhost:5173](http://localhost:5173). Panatilihing bukas ang parehong backend at frontend terminals.

## 10. Mag-sign in para sa local testing

> Ang seed file ng project ay gumagawa ng local testing accounts. Gamitin lamang ang mga ito sa local development; huwag gamitin ang password na ito sa production o ibang system.

| Role | Email | Local testing password |
|---|---|---|
| IT Admin | `admin@dyci.edu.ph` | `Admin123` |
| GSO Staff | `gso@dyci.edu.ph` | `Admin123` |

## Karaniwang problema

- **`node` o `npm` is not recognized:** i-install ang Node.js 22 LTS, isara at buksan muli ang VS Code, at subukan ulit ang version commands.
- **`psql` is not recognized:** gamitin ang pgAdmin Query Tool o idagdag ang PostgreSQL `bin` folder sa PATH.
- **Database connection error:** tiyaking nakaandar ang PostgreSQL service, umiiral ang `dyci_gso`, at tama ang username, password, host, at port sa `DATABASE_URL`.
- **Missing table o column:** tiyaking matagumpay na naipatupad ang migrations `001` hanggang `010` sa tamang order at pagkatapos ay ang seed.
- **Hindi makapagpadala ng OTP email:** tiyaking tama ang lahat ng apat na SMTP setting at Gmail App Password. Hindi gagana ang email OTP habang blangko ang SMTP settings.
- **CORS error sa browser:** tiyaking `FRONTEND_ORIGIN=http://localhost:5173` ang nasa `backend/.env`, at i-restart ang backend matapos itong baguhin.
