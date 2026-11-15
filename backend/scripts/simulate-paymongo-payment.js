// Local test helper for Loss & Damage payments. PayMongo cannot reach localhost, so this sends the same signed
// "link.payment.paid" event that PayMongo sends after a test payment, to the backend running on this computer.
// It always targets 127.0.0.1 and no other server, because it signs with the real webhook secret.
//
// Easiest: type only the case number. The link and the amount are looked up in the local database (read only).
//   node scripts/simulate-paymongo-payment.js 00007
//   node scripts/simulate-paymongo-payment.js REQ-2026-00007
// Or give the link id and the amount in centavos yourself:
//   node scripts/simulate-paymongo-payment.js link_abc123 150000
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

function usageAndExit() {
  console.error('Usage: node scripts/simulate-paymongo-payment.js <case number>');
  console.error('   e.g. node scripts/simulate-paymongo-payment.js 00007');
  console.error('   or:  node scripts/simulate-paymongo-payment.js <link id> <amount in centavos>');
  process.exit(1);
}

// Finds the one case with this number that is waiting for a payment. Read only.
async function findAwaitingLink(caseNumber) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set in backend/.env.');
  const pattern = /^REQ-\d{4}-\d+$/i.test(caseNumber)
    ? caseNumber.toUpperCase()
    : `REQ-%-${caseNumber.padStart(5, '0')}`;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT request.reference_no AS reference, settlement.status,
              settlement.paymongo_link_id AS "linkId", settlement.amount_centavos AS amount
         FROM loss_damage_settlements AS settlement
         JOIN service_requests AS request ON request.id = settlement.request_id
        WHERE request.reference_no LIKE $1`,
      [pattern],
    );
    if (rows.length === 0) throw new Error(`Walang case na ${caseNumber} sa local database.`);
    if (rows.length > 1) {
      throw new Error(`May higit sa isang case para sa ${caseNumber}: ${rows.map((row) => row.reference).join(', ')}. I-type ang buong reference.`);
    }
    const [row] = rows;
    if (row.status !== 'AWAITING_PAYMENT') {
      throw new Error(`${row.reference} ay nasa status na ${row.status}, hindi naghihintay ng bayad. Gumawa muna ng payment link sa GSO page.`);
    }
    return { reference: row.reference, linkId: row.linkId, amount: Number(row.amount) };
  } finally {
    await client.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  let target;
  if (args.length === 1 && /^(REQ-\d{4}-)?\d+$/i.test(args[0])) {
    try {
      target = await findAwaitingLink(args[0]);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  } else if (args.length === 2 && /^(link|cs)_[A-Za-z0-9_]+$/.test(args[0]) && Number.isInteger(Number(args[1])) && Number(args[1]) >= 100) {
    target = { reference: null, linkId: args[0], amount: Number(args[1]) };
  } else {
    usageAndExit();
  }

  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('PAYMONGO_WEBHOOK_SECRET is not set in backend/.env.');
    process.exit(1);
  }

  const { linkId, amount } = target;
  const now = Math.floor(Date.now() / 1000);
  const eventId = `evt_local_${Date.now()}`;
  const body = JSON.stringify({
    data: {
      id: eventId,
      type: 'event',
      attributes: {
        type: linkId.startsWith('cs_') ? 'checkout_session.payment.paid' : 'link.payment.paid',
        livemode: false,
        created_at: now,
        updated_at: now,
        data: {
          id: linkId,
          type: linkId.startsWith('cs_') ? 'checkout_session' : 'link',
          attributes: {
            amount,
            currency: 'PHP',
            status: 'paid',
            livemode: false,
            payments: [{
              id: `pay_${eventId}`,
              type: 'payment',
              attributes: { amount, currency: 'PHP', status: 'paid', paid_at: now },
            }],
          },
        },
      },
    },
  });
  const signature = crypto.createHmac('sha256', secret).update(`${now}.`).update(body).digest('hex');
  const url = `http://127.0.0.1:${process.env.PORT || '5000'}/api/v1/loss-damage/webhooks/paymongo`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Paymongo-Signature': `t=${now},te=${signature},li=` },
      body,
    });
  } catch {
    console.error(`Hindi maabot ang ${url}. Patakbuhin muna ang backend (npm run dev).`);
    process.exit(1);
  }
  const json = await response.json().catch(() => null);
  console.log(target.reference
    ? `Case ${target.reference}: ${peso.format(amount / 100)}`
    : `Link ${linkId}: ${peso.format(amount / 100)}`);
  console.log(`HTTP ${response.status}`, JSON.stringify(json));
  console.log(json?.data?.outcome === 'PROCESSED'
    ? 'Na-confirm ang test payment. I-refresh ang GSO page.'
    : 'Hindi na-apply ang payment. Tingnan ang outcome sa itaas.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
