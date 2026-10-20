# Suggested Student Registration and Borrowing Flow

## Recommendation

Magdagdag ng student registration, pero paghiwalayin ang **pagpapatunay ng student account** at ang **approval ng bawat borrowing request**.

Ang email OTP ay nagpapatunay lang na may access ang user sa email address. Hindi nito napapatunayang enrolled siya o valid na student. I-check pa rin ang student details sa official student records ng Registrar o sa proseso ng GSO.

## Proposed Flow

### 1. Student registration

Sa login page, maglagay ng **Create student account** link. Hihingiin sa registration form ang:

- School email address
- Password
- Buong pangalan
- Student ID
- Course o program
- Year level at section

Huwag muna humingi ng impormasyong hindi kailangan para ma-verify o maproseso ang borrowing request.

### 2. Email OTP verification

Magpadala ng OTP sa school email na ginamit sa registration. Kapag tama ang OTP, markahan ang email bilang verified.

Pagkatapos nito, huwag munang bigyan ng access sa borrowing features. Ipakita ang status na **For student verification**.

### 3. Student identity review

I-check ng Registrar o GSO kung tugma ang student ID, pangalan, course, year, at section sa official student records.

- **Approved:** maaaring mag-sign in sa student portal.
- **Needs correction:** ipakita kung anong detalye ang kailangang ayusin.
- **Rejected:** ipakita ang dahilan at kung sino ang maaaring kontakin.

Kung walang system integration sa Registrar, puwedeng manual na i-review ng GSO ang application sa unang version.

### 4. Student portal

Pag na-approve na ang account, makikita ng student ang:

- Profile at verification status
- Available items na maaaring hiramin
- Borrowing request form
- Sariling pending, approved, rejected, at active borrowing requests
- Due dates at borrowing history

### 5. Borrowing request

Sa bawat request, ilagay ang:

- Item at quantity
- Layunin o event/class na paggagamitan
- Petsa at oras ng pagkuha
- Inaasahang petsa at oras ng pagsasauli
- Optional na supporting document kung kailangan ng school policy

Hindi dapat awtomatikong maglabas ng item kapag nagsumite ng request.

### 6. GSO review ng bawat request

Susuriin ng GSO ang item availability, purpose, schedule, at borrowing policy.

- **Approved:** maaaring ihanda ng GSO ang item para sa release.
- **Rejected:** magbigay ng dahilan sa student.
- **Pending:** manatiling walang item na naka-release hangga't walang approval at aktuwal na turnover.

Sa pag-release at pagsauli, itatala ng GSO ang petsa, kondisyon ng item, at taong nag-turnover o tumanggap nito.

## Mga Status na Dapat Paghiwalayin

May dalawang magkaibang approval:

1. **Student account status:** `PENDING_VERIFICATION`, `APPROVED`, `NEEDS_CORRECTION`, o `REJECTED`.
2. **Borrowing request status:** `PENDING`, `APPROVED`, `REJECTED`, `RELEASED`, `RETURNED`, o `OVERDUE`.

Ang pag-apruba sa student account ay hindi awtomatikong pag-apruba sa request niyang humiram.

## Bagay na Kailangang Iakma sa Kasalukuyang System

Sa kasalukuyang project, may login at email OTP flow na, pero wala pang self-registration o `STUDENT` role. Ang role routing ay para pa lang sa IT Admin at GSO. Ang Requests & Borrowing page ay sample UI pa lang, at ang aktuwal na issuance records ay naka-link sa employee records.

Kaya para masuportahan ang flow na ito, kakailanganin ang:

- `STUDENT` role at student-specific routes/dashboard
- Student profile at account verification status
- Student registration at profile-review endpoints
- Borrowing request records na naka-link sa student at inventory item
- GSO queue para sa student verification at request approval
- Login handling para sa approved students at sa accounts na naghihintay pa ng review

Panatilihing hiwalay ang student profile at borrowing records sa employee records at employee issuance flow.

## Recommended First Version

1. Student registers gamit ang school email at student details.
2. Student verifies email gamit ang OTP.
3. GSO o Registrar verifies ang student record.
4. Approved students lang ang makakapasok sa student portal.
5. Student submits a borrowing request.
6. GSO approves or rejects bawat request at itinatala ang release at return.

Sa susunod na phase, maaaring ikonekta ang verification sa official student information system para mabawasan ang manual review.
