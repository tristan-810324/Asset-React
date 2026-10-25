# A.SSET Landing Page — Content Draft

> Gabay ito para sa public homepage ng A.SSET. Nakabatay ito sa kasalukuyang frontend at sa mga workflow na mayroon o sinisimulan pa sa project. Ang mungkahing copy sa ibaba ay English para tumugma sa kasalukuyang UI.

## Layunin ng homepage

Ipakilala ang A.SSET bilang equipment tracking portal ng Dr. Yanga's Colleges, ipakita kung paano ito nakatutulong sa GSO at IT Admin, at bigyan ang bisita ng malinaw na daan papunta sa portal. Dapat manatiling simple ang public homepage; pagkatapos mag-sign in, dadalhin ang bawat role sa sarili nitong workspace.

## Iminungkahing ayos ng page

### 1. Header at navigation

- Gamitin ang DYCI logo at A.SSET name.
- Panatilihin ang **Home**, **About**, at **Contact** navigation.
- Gawing malinaw ang **Login portal** button papunta sa `/login`.
- Panatilihin ang mobile menu at keyboard focus states na mayroon na sa navbar.

### 2. Hero section

Gamitin ang campus photo na nasa kasalukuyang hero, kasama ang dark overlay para madaling basahin ang text.

**Eyebrow:**

> DR. YANGA'S COLLEGES, INC.

**Headline:**

> Keep school equipment easier to manage.

**Description:**

> A.SSET brings DYCI equipment records and GSO workflows together—from item details and staff assignments to returns and repair follow-up.

**Buttons:**

- **Access the portal** → `/login`
- **Explore A.SSET** → `#about`

Sinasabi nito ang pangunahing silbi ng system nang hindi nangangakong lahat ng request at borrowing workflow ay tapos na.

### 3. Mga pangunahing kakayahan

Gumamit ng tatlo o apat na cards na maikli ang paliwanag. Ang mga ito ay tumutugma sa mga page na nasa GSO at Admin workspace.

| Card title | Mungkahing description |
|---|---|
| **Organized inventory records** | Keep school equipment details together so GSO staff can review and maintain item records. |
| **Issuance and returns** | Record equipment assigned to employees and follow its return status. |
| **Repair follow-up** | Keep items that need attention visible to the GSO team. |
| **Role-based workspaces** | Give GSO staff and IT Admin focused tools for their responsibilities. |

Iwasan ang live inventory counts o performance statistics sa public page hangga't hindi galing sa live backend data ang mga iyon.

### 4. Maikling workflow

Ipakita ang pangunahing equipment lifecycle bilang apat na hakbang:

1. **Record** — ilagay o panatilihin ang item details.
2. **Issue** — itala ang equipment assignment sa employee.
3. **Return** — i-update ang record kapag ibinalik ang equipment.
4. **Repair** — i-follow up ang item kung kailangan itong ipaayos.

Tumutugma ito sa kasalukuyang inventory, employee, issuance/return, at repair pages. Ihiwalay sa copy ang temporary borrower loans hangga't hindi pa kumpleto at nakakonekta ang request, approval, reservation, at handoff flow.

### 5. About A.SSET

**Heading:**

> A clearer view of school equipment.

**Description:**

> A.SSET is Dr. Yanga's Colleges' equipment tracking portal. It supports the teams responsible for keeping item records organized and following equipment through assignment, return, and repair.

Maaaring ilagay rito ang link sa `/about` para sa mas detalyadong paliwanag. Huwag ulitin nang buo ang lahat ng feature cards; sapat na ang maikling pagpapakilala at link.

### 6. Para kanino ang portal?

- **GSO Staff** — inventory at employee records, issuance and returns, repair follow-up, at GSO operations.
- **IT Admin** — account access at system oversight gaya ng user management at audit activity.
- **Borrowers / requesters** — may borrower-facing pages sa app. Ipakita ang request submission, borrowing, o status-tracking bilang available na serbisyo lamang kapag ang mga workflow na iyon ay nakakonekta na sa totoong backend records.

Hindi kailangang maglagay ng hiwalay na login button para sa bawat role. Dadalhin ng sign-in flow ang user sa workspace na pinapayagan ng kanyang account.

### 7. Contact at panghuling call to action

**Heading:**

> Need help with A.SSET?

**Description:**

> Contact the GSO team for equipment records, assignments, returns, and repair questions. For account access, contact your school's IT Admin through the official support channel.

**Button:** **Contact the team** → `/contact`

Panatilihin lamang ang support details na opisyal nang naaprubahan ng school sa Contact page.

### 8. Footer

> A.SSET · Dr. Yanga's Colleges, Inc.

Puwedeng idagdag ang official school website o contact links kapag nakumpirma na ang tamang URL at support details.

## Visual direction

- Panatilihin ang kasalukuyang navy/blue na base, may kaunting amber accent mula sa hero at logo.
- Gamitin ang campus photos at DYCI logo na nasa `frontend/public/dyci_img/`.
- Panatilihing maikli ang hero text at madaling basahin sa mobile.
- Gumamit ng tunay na labels at descriptive alt text para sa mga larawan.
- Huwag gumamit ng placeholder metrics, pekeng testimonials, o claims tungkol sa automation na wala pa sa backend.

## Mga claim na dapat munang hintayin

May request/borrowing screens at borrower pages sa app, pero may bahagi pa ng GSO request queue na gumagamit ng sample data at may workflow na ginagawa pa. Bago i-promote ang mga ito bilang live service, tiyaking gumagana na ang request persistence, GSO review/decision, availability handling, issuance, return, at sariling request history ng borrower.

Hangga't hindi pa iyon kumpleto, ituon ang homepage sa equipment records, employee issuance/returns, repair follow-up, at role-based portal access. Huwag magpakita ng sample counts bilang totoong system data.

## Mga kasalukuyang file na may kaugnayan

- Public homepage at About/Contact sections: [frontend/src/landing/home.tsx](./frontend/src/landing/home.tsx), [frontend/src/landing/hero.tsx](./frontend/src/landing/hero.tsx), [frontend/src/landing/about.tsx](./frontend/src/landing/about.tsx), at [frontend/src/landing/contact.tsx](./frontend/src/landing/contact.tsx).
- Public navigation: [frontend/src/components/navbars/navbar.tsx](./frontend/src/components/navbars/navbar.tsx).
- GSO workspace navigation: [frontend/src/components/navbars/gsonavbar.tsx](./frontend/src/components/navbars/gsonavbar.tsx).
- Public at role-based routes: [frontend/src/App.tsx](./frontend/src/App.tsx).

Ang dokumentong ito ay homepage content/layout guide. Hindi nito binabago ang kasalukuyang React pages.

## Dagdag na page at design direction

Ang mga sumusunod ay dagdag na content at visual specification para sa public landing pages. Panatilihing hindi nagbabago ang kasalukuyang application logic at role-based workflows habang hindi pa ito ipinapatupad sa source code.

### Shared visual system

- Gawing white ang pangunahing canvas ng Home, About, FAQ, at Contact.
- Gamitin ang navy at DYCI blue para sa pangunahing text at actions. Magdagdag ng banayad na sky-blue papuntang indigo/violet gradients sa hero accents, card edges, icon tiles, at section backgrounds.
- Gumamit ng malalambot na gradient glow sa likod ng content; panatilihing puti at madaling basahin ang karamihan ng surface.
- Sa Home hero, ilagay ang headline at buttons sa puting bahagi at gumamit ng campus photo bilang katabing visual panel o card. Lagyan ito ng light blue/indigo treatment para bumagay sa school branding.
- Panatilihing pare-pareho ang header at footer sa lahat ng public pages. Navigation: **Home**, **About**, **FAQ**, **Contact**, at **Login portal**.
- Gumamit ng rounded cards, malinaw na spacing, responsive columns, keyboard focus states, at descriptive alt text sa school images.

### Home (`/`)

1. Shared header na may DYCI logo at A.SSET name.
2. Hero na may school name, malinaw na equipment-tracking headline, maikling paliwanag, **Access the portal** button papuntang `/login`, at **Explore A.SSET** link papuntang About section.
3. Tatlo o apat na capability cards: inventory records, issuance and returns, repair follow-up, at role-based workspaces.
4. Apat na lifecycle steps: **Record → Issue → Return → Repair**.
5. Maikling About preview na may link sa `/about`.
6. Support call to action na may link sa `/contact`.
7. Shared footer.

Iwasan ang pekeng counts, testimonials, o pangakong automated ang workflow.

### About (`/about`)

- Panatilihin ang maikling paliwanag kung sino ang A.SSET para sa DYCI at kung paano ito tumutulong sa GSO Staff at IT Admin.
- Ipakita ang inventory, issuance/returns, at repair capabilities bilang magkakahiwalay na cards.
- Magdagdag ng simpleng lifecycle visual mula pag-record hanggang return o repair.
- Gumamit ng campus o school image bilang supporting visual, hindi bilang full-page dark background.
- Magtapos sa **Open the portal** at **Contact the team** links.

### FAQ (`/faq`)

Gumamit ng searchable o grouped accordion kung kailangan; panatilihing mababasa rin ang mga tanong at sagot gamit ang keyboard at screen reader. Ipakita muna ang mga sagot na may kaugnayan sa access at equipment workflow.

**What is A.SSET?**  
A.SSET is Dr. Yanga's Colleges' equipment tracking portal. It helps authorized teams keep equipment records and follow assignment, return, and repair activity.

**Who can use the portal?**  
GSO Staff, IT Admin, and authorized borrowers can sign in. The portal shows the workspace allowed for each account.

**What equipment information can the team manage?**  
The current workspaces support equipment records, employee records, issuance and returns, and repair follow-up.

**How do I request to borrow equipment?**  
Ask the GSO team for the current approved borrowing procedure. Show online request submission as an available service only after the request, review, availability, issuance, and return workflow is connected to live records.

**Where can I check a request or assignment?**  
Sign in and use the pages available to your account. If the record or status you need is not shown, contact GSO through the school's official support channel.

**Who can help with equipment records, returns, or repairs?**  
Contact GSO Staff through the official DYCI office or support channel.

**Who can help if I cannot sign in?**  
Contact the school's IT Admin through its official support channel. Do not share your password or one-time verification code.

**Can I access A.SSET outside campus?**  
Access depends on the school's account and network setup. Contact IT Admin to confirm the current access arrangements.

CTA sa dulo: **Still need help? Contact the team** → `/contact`.

### Contact (`/contact`)

- Panatilihin ang dalawang malinaw na contact paths: **GSO Staff** para sa equipment at records; **IT Admin** para sa account at portal access.
- Huwag maglagay ng email address, phone number, office hours, o support form hangga't hindi opisyal na kinukumpirma ng school.
- Magdagdag ng maikling listahan ng detalyeng makatutulong sa support request, gaya ng item name/code, issuance reference, department, at maikling paglalarawan.
- Magbigay ng login CTA para sa may account na.

### Shared footer

Ipakita ang **A.SSET · Dr. Yanga's Colleges, Inc.**, links papuntang Home, About, FAQ, at Contact, at **Login portal**. Idagdag lamang ang official school website o support details kapag nakumpirma ang tamang impormasyon.

### Karagdagang page na kailangan lang kung may feature na iyon

Hindi kailangan ng hiwalay na Services o Borrowing marketing page habang hindi pa live ang kumpletong borrower workflow. Magdagdag lamang ng Privacy page kung mangongolekta ang public Contact page ng personal na impormasyon; kailangang tumugma ang policy sa aktuwal na data handling ng app.
