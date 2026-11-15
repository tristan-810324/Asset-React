// Tests for Loss & Damage Cases (PayMongo TEST mode). The signature, amount, and event checks run anywhere.
// The decision and payment rules run against a real PostgreSQL database, the same way as the other tests:
//
//   $env:TEST_DATABASE_URL = "postgres://postgres@127.0.0.1:55432/asset_test"
//   node --test --test-concurrency=1 tests/loss-damage.test.js
//
// PayMongo is replaced by a fake for these tests, so no request leaves this machine.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const testDatabaseUrl = process.env.TEST_DATABASE_URL || '';
if (testDatabaseUrl && !new URL(testDatabaseUrl).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must point at a database whose name ends in "_test".');
}

const WEBHOOK_SECRET = 'whsk_loss_damage_tests_only';
Object.assign(process.env, {
  DATABASE_URL: testDatabaseUrl || 'postgres://postgres@127.0.0.1:1/not_used',
  JWT_SECRET: 'loss-damage-test-secret-'.padEnd(40, 'x'),
  SMTP_HOST: '',
  SMTP_PORT: '',
  SMTP_USER: '',
  SMTP_PASS: '',
  PAYMONGO_SECRET_KEY: 'sk_test_loss_damage_tests_only',
  PAYMONGO_WEBHOOK_SECRET: WEBHOOK_SECRET,
});

const paymongo = require('../src/modules/loss-damage/paymongo');
const lossDamage = require('../src/modules/loss-damage/loss-damage.service');

// Helpers that build what PayMongo would send.
function sign(rawBody, { secret = WEBHOOK_SECRET, timestamp = Math.floor(Date.now() / 1000), encoding = 'hex', live = false } = {}) {
  const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest(encoding);
  return live ? `t=${timestamp},te=,li=${digest}` : `t=${timestamp},te=${digest},li=`;
}

// The event as PayMongo sends it (envelope A). A checkout session (cs_...) has no amount of its own, only its payments;
// an older link (link_...) also states its amount.
function paidEvent({ eventId, linkId, amount, currency = 'PHP', livemode = false }) {
  const payment = { id: `pay_${eventId}`, type: 'payment', attributes: { amount, currency, status: 'paid', paid_at: 1700000100 } };
  const isSession = linkId.startsWith('cs_');
  const resource = isSession
    ? { id: linkId, type: 'checkout_session', attributes: { livemode, status: 'active', payments: [payment] } }
    : { id: linkId, type: 'link', attributes: { amount, currency, status: 'paid', livemode, payments: [payment] } };
  return {
    data: {
      id: eventId,
      type: 'event',
      attributes: {
        type: isSession ? 'checkout_session.payment.paid' : 'link.payment.paid',
        livemode,
        created_at: 1700000000,
        updated_at: 1700000000,
        data: resource,
      },
    },
  };
}

function signed(body, options) {
  const rawBody = Buffer.from(JSON.stringify(body));
  return { rawBody, signature: sign(rawBody, options) };
}

// ---- Pure checks (no database) -------------------------------------------------------------------------------

test('a PayMongo signature is checked against the raw body, the timestamp, and the test secret', () => {
  const raw = Buffer.from('{"data":{"id":"evt_1"}}');
  const now = 1700000000;
  const hex = sign(raw, { timestamp: now });
  assert.equal(paymongo.verifySignature(raw, hex, WEBHOOK_SECRET, now + 5), 'valid');
  assert.equal(paymongo.verifySignature(raw, sign(raw, { timestamp: now, encoding: 'base64' }), WEBHOOK_SECRET, now + 5), 'valid');
  assert.equal(paymongo.verifySignature(raw, hex.replace(/te=([0-9a-f]+)/, (_match, digest) => `te=${digest.toUpperCase()}`), WEBHOOK_SECRET, now + 5), 'valid');
  assert.equal(paymongo.verifySignature(raw, hex, 'whsk_some_other_secret', now + 5), 'invalid');
  assert.equal(paymongo.verifySignature(Buffer.from('{"data":{"id":"evt_2"}}'), hex, WEBHOOK_SECRET, now + 5), 'invalid');
  assert.equal(paymongo.verifySignature(raw, sign(raw, { timestamp: now, live: true }), WEBHOOK_SECRET, now + 5), 'invalid');
  assert.equal(paymongo.verifySignature(raw, hex, WEBHOOK_SECRET, now + 4 * 24 * 60 * 60), 'expired');
  assert.equal(paymongo.verifySignature(raw, hex, WEBHOOK_SECRET, now - 10 * 60), 'expired');
  assert.equal(paymongo.verifySignature(raw, 'garbage', WEBHOOK_SECRET, now), 'invalid');
  assert.equal(paymongo.verifySignature(raw, undefined, WEBHOOK_SECRET, now), 'invalid');
});

test('amounts are typed in pesos, kept in centavos, and limited to what PayMongo accepts', () => {
  assert.equal(lossDamage.amountInCentavos('1500'), 150000);
  assert.equal(lossDamage.amountInCentavos('1,500.5'), 150050);
  assert.equal(lossDamage.amountInCentavos(99.99), 9999);
  assert.equal(lossDamage.amountInCentavos('9999999.99'), 999999999);
  for (const bad of ['0', '0.99', '1.234', '-5', 'abc', '', '10000000', '1e3', '1.5.5']) {
    assert.throws(() => lossDamage.amountInCentavos(bad), { status: 400 }, `"${bad}" should be refused`);
  }
});

test('a link.payment.paid event gives the link, the payment, and the paid amount', () => {
  const event = paymongo.readEvent(paidEvent({ eventId: 'evt_a', linkId: 'link_a', amount: 150000 }));
  assert.equal(event.eventId, 'evt_a');
  assert.equal(event.eventType, 'link.payment.paid');
  assert.equal(event.livemode, false);
  assert.equal(event.linkId, 'link_a');
  assert.equal(event.linkAmount, 150000);
  assert.equal(event.currency, 'PHP');
  assert.equal(event.paymentId, 'pay_evt_a');
  assert.equal(event.paymentAmount, 150000);
  assert.ok(event.paidAt instanceof Date);
});

test('a checkout_session.payment.paid event is read in either PayMongo envelope', () => {
  const sessionEvent = paymongo.readEvent(paidEvent({ eventId: 'evt_s', linkId: 'cs_s', amount: 80000 }));
  assert.equal(sessionEvent.eventType, 'checkout_session.payment.paid');
  assert.equal(sessionEvent.linkId, 'cs_s');
  assert.equal(sessionEvent.linkAmount, null, 'a session states no amount of its own');
  assert.equal(sessionEvent.paymentAmount, 80000);
  assert.equal(sessionEvent.paymentCurrency, 'PHP');
  // The second envelope (Hosted Checkout guide) carries no event id here, so the payment id is what identifies it.
  const second = paymongo.readEvent({
    event_type: 'send.webhook',
    data: {
      type: 'checkout_session.payment.paid',
      livemode: false,
      data: { id: 'cs_s2', type: 'checkout_session', attributes: { payments: [{ id: 'pay_s2', type: 'payment', attributes: { amount: 80000, currency: 'PHP', status: 'paid' } }] } },
    },
  });
  assert.equal(second.eventId, '');
  assert.equal(second.eventType, 'checkout_session.payment.paid');
  assert.equal(second.livemode, false);
  assert.equal(second.linkId, 'cs_s2');
  assert.equal(second.paymentId, 'pay_s2');
  assert.equal(second.paymentAmount, 80000);
});

// ---- Database checks (need TEST_DATABASE_URL) ----------------------------------------------------------------

const databaseTest = (name, fn) => test(name, { skip: testDatabaseUrl ? false : 'set TEST_DATABASE_URL to an empty *_test database to run' }, fn);

const pool = require('../src/config/db');
const requestsService = require('../src/modules/requests/requests.service');
const returnsRepository = require('../src/modules/issuances/returns.repository');

const gso = { id: '1', name: 'GSO Staff One', email: 'gso@invalid', roles: ['GSO_STAFF'] };
const requester = { id: '3', name: 'Requester One', email: 'requester@invalid', roles: ['BORROWER'] };
const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
const rejects = (promise, pattern, status) => assert.rejects(promise, (error) => {
  assert.match(error.message, pattern);
  if (status) assert.equal(error.status, status);
  return true;
});

// A fake PayMongo: it hands out a new test checkout per request, and accepts expire and archive calls.
const paymongoCalls = [];
let checkoutCount = 0;
const realFetch = globalThis.fetch;
function fakePaymongo(url, options = {}) {
  const { pathname } = new URL(url);
  const body = options.body ? JSON.parse(options.body) : null;
  paymongoCalls.push({ method: options.method, pathname, body });
  const reply = (status, json) => Promise.resolve({ ok: status < 400, status, json: async () => json });
  if (options.method === 'POST' && pathname === '/v1/checkout_sessions') {
    checkoutCount += 1;
    const id = `cs_test_${checkoutCount}`;
    return reply(200, {
      data: { id, type: 'checkout_session', attributes: { checkout_url: `https://checkout.paymongo.com/test/${id}`, livemode: false, status: 'active' } },
    });
  }
  if (options.method === 'POST' && /^\/v1\/checkout_sessions\/[^/]+\/expire$/.test(pathname)) {
    const id = decodeURIComponent(pathname.split('/')[3]);
    return reply(200, { data: { id, type: 'checkout_session', attributes: { status: 'expired' } } });
  }
  if (options.method === 'PATCH' && pathname.startsWith('/v1/payment_links/')) {
    return reply(200, { data: { id: decodeURIComponent(pathname.split('/').pop()), status: 'archived' } });
  }
  return reply(404, { errors: [{ detail: 'not part of the test fake' }] });
}

const seed = `
  INSERT INTO users (id, name, email, password_hash) VALUES
    (1, 'GSO Staff One', 'gso@invalid', 'x'),
    (3, 'Requester One', 'requester@invalid', 'x');
  INSERT INTO requester_identity_profiles (user_id, employee_code, first_name, last_name, department, position, contact_number, verification_status)
    VALUES (3, 'EMP-3', 'Ana', 'Reyes', 'Registrar', 'Clerk', '09171234567', 'Verified');
`;

// A Loss / Damage Report as the requester sends it. Each test uses its own id, so the tests do not depend on each other.
async function newReport(id) {
  const form = {
    incidentType: 'LOST',
    keyArea: 'Gym',
    incidentDate: '2026-11-14',
    responsiblePerson: 'Ana Reyes',
    items: [{ quantity: 1, description: 'Laptop', assetCode: 'LAP-1', issuanceId: '1', unitOfMeasure: 'piece', remarks: '' }],
    remarks: 'Left after the event',
  };
  await pool.query(
    `INSERT INTO service_requests (id, reference_no, request_type, title, form_data, status, requested_by_user_id)
     VALUES ($1, $2, 'LOSS_DAMAGE_REPORT', 'Lost property report: Gym', $3::JSONB, 'Submitted', 3)`,
    [id, `REQ-2026-${id}`, JSON.stringify(form)],
  );
  return String(id);
}

test.before(async () => {
  if (!testDatabaseUrl) return;
  const { rows } = await pool.query("SELECT COUNT(*)::INTEGER AS tables FROM information_schema.tables WHERE table_schema = 'public'");
  if (rows[0].tables) throw new Error('The test database must be empty; it already has tables.');
  const migrationsDir = path.join(__dirname, '../database/migrations');
  for (const file of fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    await pool.query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  await pool.query(seed);
  globalThis.fetch = fakePaymongo;
});

test.after(async () => {
  if (!testDatabaseUrl) return;
  globalThis.fetch = realFetch;
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.end();
});

databaseTest('a no-charge decision closes the case at once, and the decision cannot change afterwards', async () => {
  const id = await newReport(201);
  await lossDamage.startReview(id, gso);
  const result = await lossDamage.decide(id, { resolution: 'NO_CHARGE', reason: 'Item was found intact' }, gso);
  assert.equal(result.case.status, 'Closed');
  assert.equal(result.case.settlement.status, 'NO_CHARGE');
  assert.equal(result.case.settlement.amountCentavos, null);
  assert.equal(result.linkError, '');
  await rejects(lossDamage.decide(id, { resolution: 'FOR_REPAIR', reason: 'Changed my mind' }, gso), /can no longer be changed/, 409);
  await rejects(lossDamage.closeCase(id, { handled: true }, gso), /already closed/, 409);
});

databaseTest('for repair stays in progress until the follow-up is confirmed', async () => {
  const id = await newReport(202);
  await rejects(lossDamage.decide(id, { resolution: 'FOR_REPAIR', reason: 'Screen cracked' }, gso), /Start the review/, 409);
  await lossDamage.startReview(id, gso);
  await rejects(lossDamage.startReview(id, gso), /already under review/, 409);
  const decided = await lossDamage.decide(id, { resolution: 'FOR_REPAIR', reason: 'Screen cracked' }, gso);
  assert.equal(decided.case.status, 'In Progress');
  assert.equal(decided.case.settlement.status, 'FOR_REPAIR');
  await rejects(lossDamage.closeCase(id, { note: 'Done' }, gso), /physical follow-up/, 400);
  const closed = await lossDamage.closeCase(id, { handled: true, note: 'Screen replaced' }, gso);
  assert.equal(closed.case.status, 'Closed');
  assert.equal(closed.case.settlement.status, 'FOR_REPAIR');
});

databaseTest('payment required creates one GCash test checkout at the decided amount', async () => {
  const id = await newReport(203);
  await lossDamage.startReview(id, gso);
  paymongoCalls.length = 0;
  const result = await lossDamage.decide(id, { resolution: 'PAYMENT_REQUIRED', reason: 'Lost the charger', amount: '1,500' }, gso);
  assert.equal(result.linkError, '');
  assert.equal(result.case.status, 'In Progress');
  assert.equal(result.case.settlement.status, 'AWAITING_PAYMENT');
  assert.equal(result.case.settlement.amountCentavos, 150000);
  assert.match(result.case.settlement.linkId, /^cs_test_\d+$/);
  assert.equal(result.case.settlement.checkoutUrl, `https://checkout.paymongo.com/test/${result.case.settlement.linkId}`);
  const creates = paymongoCalls.filter((call) => call.method === 'POST');
  assert.equal(creates.length, 1);
  const attributes = creates[0].body.data.attributes;
  assert.deepEqual(attributes.payment_method_types, ['gcash'], 'only GCash is offered, no QR code');
  assert.deepEqual(attributes.line_items, [{
    name: 'Loss & Damage case REQ-2026-203',
    amount: 150000,
    currency: 'PHP',
    quantity: 1,
    description: 'A.S.SET test payment. No real money is charged.',
  }]);
  assert.equal(attributes.reference_number, 'REQ-2026-203');
  assert.equal(attributes.send_email_receipt, false);
  assert.match(attributes.success_url, /\/requester\/requests\/\d+$/, 'the payer returns to the request page');
  await rejects(lossDamage.decide(id, { resolution: 'NO_CHARGE', reason: 'Changed my mind' }, gso), /Cancel the payment link/, 409);
  await rejects(lossDamage.decide(id, { resolution: 'PAYMENT_REQUIRED', reason: 'Too small', amount: '0.50' }, gso), /at least/, 400);
});

databaseTest('a verified PayMongo payment marks the case paid once, and a repeated delivery changes nothing', async () => {
  const id = await newReport(204);
  await lossDamage.startReview(id, gso);
  const decided = await lossDamage.decide(id, { resolution: 'PAYMENT_REQUIRED', reason: 'Broken chair leg', amount: '500' }, gso);
  const body = paidEvent({ eventId: 'evt_204_paid', linkId: decided.case.settlement.linkId, amount: 50000 });
  assert.deepEqual(await lossDamage.receivePaymongoWebhook(signed(body)), { outcome: 'PROCESSED' });
  const once = await lossDamage.getCase(id);
  assert.equal(once.case.settlement.status, 'PAID');
  assert.equal(once.case.status, 'In Progress');
  assert.ok(once.case.settlement.paidAt instanceof Date);
  assert.equal(once.case.settlement.paymentId, 'pay_evt_204_paid');
  // PayMongo sends the same event again when an earlier answer was late.
  assert.deepEqual(await lossDamage.receivePaymongoWebhook(signed(body)), { outcome: 'DUPLICATE' });
  const again = await lossDamage.getCase(id);
  assert.equal(again.case.settlement.status, 'PAID');
  assert.equal(again.case.settlement.paidAt.getTime(), once.case.settlement.paidAt.getTime());
  const confirmations = await one("SELECT COUNT(*)::INTEGER AS n FROM service_request_history WHERE request_id = $1 AND note LIKE 'PayMongo confirmed%'", [id]);
  assert.equal(confirmations.n, 1);
});

databaseTest('the second PayMongo envelope, without an event id, is accepted once by its payment id', async () => {
  const id = await newReport(211);
  await lossDamage.startReview(id, gso);
  const decided = await lossDamage.decide(id, { resolution: 'PAYMENT_REQUIRED', reason: 'Lost pen case', amount: '120' }, gso);
  const body = {
    event_type: 'send.webhook',
    data: {
      type: 'checkout_session.payment.paid',
      livemode: false,
      data: {
        id: decided.case.settlement.linkId,
        type: 'checkout_session',
        attributes: { payments: [{ id: 'pay_211', type: 'payment', attributes: { amount: 12000, currency: 'PHP', status: 'paid' } }] },
      },
    },
  };
  assert.deepEqual(await lossDamage.receivePaymongoWebhook(signed(body)), { outcome: 'PROCESSED' });
  assert.deepEqual(await lossDamage.receivePaymongoWebhook(signed(body)), { outcome: 'DUPLICATE' });
  assert.equal((await lossDamage.getCase(id)).case.settlement.status, 'PAID');
});

databaseTest('a payment with the wrong amount, currency, mode, or link is logged and never settles the case', async () => {
  const id = await newReport(205);
  await lossDamage.startReview(id, gso);
  const decided = await lossDamage.decide(id, { resolution: 'PAYMENT_REQUIRED', reason: 'Torn bag', amount: '500' }, gso);
  const linkId = decided.case.settlement.linkId;
  const outcomes = [
    (await lossDamage.receivePaymongoWebhook(signed(paidEvent({ eventId: 'evt_205_amount', linkId, amount: 49900 })))).outcome,
    (await lossDamage.receivePaymongoWebhook(signed(paidEvent({ eventId: 'evt_205_currency', linkId, amount: 50000, currency: 'USD' })))).outcome,
    (await lossDamage.receivePaymongoWebhook(signed(paidEvent({ eventId: 'evt_205_live', linkId, amount: 50000, livemode: true })))).outcome,
    (await lossDamage.receivePaymongoWebhook(signed(paidEvent({ eventId: 'evt_205_link', linkId: 'link_unknown', amount: 50000 })))).outcome,
  ];
  assert.deepEqual(outcomes, ['REJECTED_AMOUNT', 'REJECTED_CURRENCY', 'REJECTED_LIVE', 'REJECTED_LINK']);
  const still = await lossDamage.getCase(id);
  assert.equal(still.case.settlement.status, 'AWAITING_PAYMENT');
  assert.notEqual(still.case.settlement.paymentWarning, null, 'GSO is shown that a payment was not applied');
  const paid = await lossDamage.receivePaymongoWebhook(signed(paidEvent({ eventId: 'evt_205_ok', linkId, amount: 50000 })));
  assert.equal(paid.outcome, 'PROCESSED');
});

databaseTest('a cancelled checkout cannot settle the case, and a new checkout at a corrected amount can', async () => {
  const id = await newReport(206);
  await lossDamage.startReview(id, gso);
  const first = (await lossDamage.decide(id, { resolution: 'PAYMENT_REQUIRED', reason: 'Wrong amount', amount: '200' }, gso)).case.settlement.linkId;
  await rejects(lossDamage.cancelPaymentLink(id, { reason: '' }, gso), /Enter the reason for cancelling/, 400);
  const cancelled = await lossDamage.cancelPaymentLink(id, { reason: 'Amount was typed wrong' }, gso);
  assert.equal(cancelled.case.settlement.status, 'PENDING_LINK');
  assert.equal(cancelled.case.settlement.linkId, null);
  assert.equal(cancelled.case.settlement.cancelledLinkCount, 1);
  assert.ok(paymongoCalls.some((call) => call.method === 'POST' && call.pathname === `/v1/checkout_sessions/${first}/expire`), 'the old session is expired at PayMongo');
  const late = await lossDamage.receivePaymongoWebhook(signed(paidEvent({ eventId: 'evt_206_late', linkId: first, amount: 20000 })));
  assert.equal(late.outcome, 'REJECTED_STATE');
  const relinked = await lossDamage.decide(id, { resolution: 'PAYMENT_REQUIRED', reason: 'Corrected amount', amount: '250' }, gso);
  assert.equal(relinked.case.settlement.status, 'AWAITING_PAYMENT');
  assert.equal(relinked.case.settlement.amountCentavos, 25000);
  const paid = await lossDamage.receivePaymongoWebhook(signed(paidEvent({ eventId: 'evt_206_new', linkId: relinked.case.settlement.linkId, amount: 25000 })));
  assert.equal(paid.outcome, 'PROCESSED');
  assert.equal((await lossDamage.getCase(id)).case.settlement.status, 'PAID');
});

databaseTest('the requester sees the checkout link only while the payment can still be made', async () => {
  const id = await newReport(207);
  await lossDamage.startReview(id, gso);
  const decided = await lossDamage.decide(id, { resolution: 'PAYMENT_REQUIRED', reason: 'Lost cable', amount: '300' }, gso);
  const awaiting = await lossDamage.getMine(id, requester);
  assert.equal(awaiting.requestStatus, 'In Progress');
  assert.equal(awaiting.settlement.status, 'AWAITING_PAYMENT');
  assert.equal(awaiting.settlement.checkoutUrl, decided.case.settlement.checkoutUrl);
  await lossDamage.receivePaymongoWebhook(signed(paidEvent({ eventId: 'evt_207_paid', linkId: decided.case.settlement.linkId, amount: 30000 })));
  const paid = await lossDamage.getMine(id, requester);
  assert.equal(paid.settlement.status, 'PAID');
  assert.equal(paid.settlement.checkoutUrl, null);
  await rejects(lossDamage.getMine(id, { id: '99', roles: ['BORROWER'] }), /Request not found/, 404);
});

databaseTest('a payment case cannot be closed until PayMongo confirms the payment', async () => {
  const id = await newReport(208);
  await lossDamage.startReview(id, gso);
  const decided = await lossDamage.decide(id, { resolution: 'PAYMENT_REQUIRED', reason: 'Lost tablet', amount: '800' }, gso);
  await rejects(lossDamage.closeCase(id, { handled: true }, gso), /Wait until PayMongo confirms/, 409);
  await rejects(lossDamage.closeCase(id, { handled: false }, gso), /physical follow-up/, 400);
  await lossDamage.receivePaymongoWebhook(signed(paidEvent({ eventId: 'evt_208_paid', linkId: decided.case.settlement.linkId, amount: 80000 })));
  const closed = await lossDamage.closeCase(id, { handled: true, note: 'Tablet written off' }, gso);
  assert.equal(closed.case.status, 'Closed');
  assert.equal(closed.case.settlement.status, 'PAID');
});

databaseTest('a webhook with a bad, missing, or old signature is refused before anything is read', async () => {
  const id = await newReport(209);
  await lossDamage.startReview(id, gso);
  const decided = await lossDamage.decide(id, { resolution: 'PAYMENT_REQUIRED', reason: 'Lost bag', amount: '500' }, gso);
  const raw = Buffer.from(JSON.stringify(paidEvent({ eventId: 'evt_209', linkId: decided.case.settlement.linkId, amount: 50000 })));
  await rejects(lossDamage.receivePaymongoWebhook({ rawBody: raw, signature: sign(raw, { secret: 'whsk_wrong' }) }), /not valid/, 401);
  await rejects(lossDamage.receivePaymongoWebhook({ rawBody: raw, signature: sign(raw, { timestamp: Math.floor(Date.now() / 1000) - 4 * 24 * 3600 }) }), /too old/, 400);
  await rejects(lossDamage.receivePaymongoWebhook({ rawBody: raw, signature: undefined }), /not valid/, 401);
  assert.equal((await lossDamage.getCase(id)).case.settlement.status, 'AWAITING_PAYMENT');
  assert.equal((await one("SELECT COUNT(*)::INTEGER AS n FROM paymongo_webhook_events WHERE provider_event_id = 'evt_209'")).n, 0);
});

databaseTest('the generic status endpoint cannot decide a loss or damage report', async () => {
  const id = await newReport(210);
  await rejects(requestsService.updateStatus(id, { status: 'Approved' }, gso), /Loss \/ damage reports are decided/, 409);
  assert.equal((await one('SELECT status FROM service_requests WHERE id = $1', [id])).status, 'Submitted');
});

databaseTest('the GSO list shows each case with its decision and whether PayMongo setup is complete', async () => {
  const listing = await lossDamage.listCases();
  const row = listing.cases.find((item) => item.id === '204');
  assert.ok(row, 'case 204 is listed');
  assert.equal(row.settlement.status, 'PAID');
  assert.deepEqual(listing.setup, { paymentLinks: true, webhook: true });
});

// ---- What a paid case does to the inventory --------------------------------------------------------------------

const token = () => crypto.randomBytes(16).toString('hex');
let fixtureCount = 0;

// An item issued to the requester (Ana Reyes, user 3): barcode units when tracked by unit, otherwise a quantity.
async function issuedItem({ description, tracking, units = [], quantity = 1 }) {
  fixtureCount += 1;
  const n = fixtureCount;
  const category = await one('INSERT INTO item_categories (name) VALUES ($1) RETURNING id', [`Loss test category ${n}`]);
  const item = await one(
    `INSERT INTO item_catalog (item_code, item_name, description, category_id, category, tracking_mode, quantity)
     VALUES ($1, $2, $2, $3, $4, $5, $6) RETURNING id`,
    [`LDT-${n}`, description, category.id, `Loss test category ${n}`, tracking, quantity],
  );
  const employee = await one(
    `INSERT INTO employees (employee_code, first_name, last_name, department, "position", email)
     VALUES ($1, 'Ana', 'Reyes', 'Registrar', 'Clerk', $2) RETURNING id`,
    [`LDT-EMP-${n}`, `ana.reyes.${n}@invalid`],
  );
  const batch = await one(
    `INSERT INTO employee_issuance_batches (employee_id, requested_by_user_id, requester_user_id, status, token_hash, token_expires_at, decided_at)
     VALUES ($1, 1, 3, 'Issued', $2, NOW() + INTERVAL '1 day', NOW()) RETURNING id`,
    [employee.id, token()],
  );
  const issuance = await one(
    `INSERT INTO employee_issuances (batch_id, employee_id, item_id, requested_by_user_id, status, token_hash, token_expires_at,
                                     quantity, unit_of_measure, item_condition, decided_at)
     VALUES ($1, $2, $3, 1, 'Issued', $4, NOW() + INTERVAL '1 day', $5, 'piece', 'Good', NOW()) RETURNING id`,
    [batch.id, employee.id, item.id, token(), units.length || quantity],
  );
  const tagIds = [];
  for (const [index, code] of units.entries()) {
    const tag = await one(
      `INSERT INTO asset_unit_tags (tag_code, item_id, unit_number, condition, custody_status, lifecycle_status,
                                    issuance_id, assigned_employee_id, assigned_user_id)
       VALUES ($1, $2, $3, 'Good', 'Issued', 'Active', $4, $5, 3) RETURNING id`,
      [code, item.id, index + 1, issuance.id, employee.id],
    );
    tagIds.push(tag.id);
  }
  return { itemId: item.id, itemCode: `LDT-${n}`, issuanceId: issuance.id, tagIds };
}

// A Loss / Damage Report whose items were already checked by the server, as reportedIssuedRows leaves them.
async function reportWith(id, incidentType, items) {
  const form = { incidentType, keyArea: 'Lab', incidentDate: '2026-11-14', responsiblePerson: 'Ana Reyes', items, remarks: '' };
  await pool.query(
    `INSERT INTO service_requests (id, reference_no, request_type, title, form_data, status, requested_by_user_id)
     VALUES ($1, $2, 'LOSS_DAMAGE_REPORT', 'Loss test report', $3::JSONB, 'Submitted', 3)`,
    [id, `REQ-2026-${id}`, JSON.stringify(form)],
  );
  return String(id);
}

// GSO decides a payment for the case, then PayMongo confirms it.
async function payCase(id, amount) {
  await lossDamage.startReview(id, gso);
  const decided = await lossDamage.decide(id, { resolution: 'PAYMENT_REQUIRED', reason: 'Reported by the requester', amount }, gso);
  const result = await lossDamage.receivePaymongoWebhook(signed(paidEvent({
    eventId: `evt_inventory_${id}`,
    linkId: decided.case.settlement.linkId,
    amount: Math.round(Number(amount) * 100),
  })));
  assert.equal(result.outcome, 'PROCESSED');
  return result;
}

const historyNotes = async (id) => (await pool.query('SELECT note FROM service_request_history WHERE request_id = $1 ORDER BY id', [id])).rows.map((row) => row.note);

databaseTest('a paid damaged unit leaves the requester and is set aside in To Be Repaired as Unserviceable', async () => {
  const item = await issuedItem({ description: 'Printer', tracking: 'individual', units: ['PRN-DMG-1'] });
  const id = await reportWith(212, 'DAMAGED', [{ issuanceId: String(item.issuanceId), assetCode: 'PRN-DMG-1', quantity: 1, description: 'Printer', remarks: '' }]);
  await payCase(id, '500');
  const tag = await one('SELECT tag_code, custody_status, lifecycle_status, condition, location, issuance_id, assigned_employee_id FROM asset_unit_tags WHERE id = $1', [item.tagIds[0]]);
  assert.notEqual(tag.tag_code, 'PRN-DMG-1', 'the old barcode is retired, as on every return');
  assert.deepEqual(
    { custody_status: tag.custody_status, lifecycle_status: tag.lifecycle_status, condition: tag.condition, location: tag.location, issuance_id: tag.issuance_id, assigned_employee_id: tag.assigned_employee_id },
    { custody_status: 'Available', lifecycle_status: 'Active', condition: 'Unserviceable', location: 'To Be Repaired', issuance_id: null, assigned_employee_id: null },
  );
  assert.deepEqual(await one('SELECT returned_quantity, status FROM employee_issuances WHERE id = $1', [item.issuanceId]), { returned_quantity: 1, status: 'Returned' });
  const record = await one(
    `SELECT status, return_condition, asset_unit_tag_id::TEXT AS "tagId", quantity, settlement_status, repair_resolved_at
       FROM employee_issuance_returns WHERE issuance_id = $1`,
    [item.issuanceId],
  );
  assert.deepEqual(record, {
    status: 'Returned', return_condition: 'Unserviceable', tagId: String(item.tagIds[0]), quantity: 1, settlement_status: null, repair_resolved_at: null,
  }, 'an open repair record, so the unit shows in To Be Repaired');
  assert.ok((await historyNotes(id)).some((note) => /^Moved out of the requester's holdings: Printer \(barcode PRN-DMG-1\) set aside in To Be Repaired as Unserviceable\.$/.test(note)));
  assert.equal((await one("SELECT COUNT(*)::INTEGER AS n FROM inventory_change_logs WHERE item_id = $1 AND request_id = $2 AND action = 'returned'", [item.itemId, id])).n, 1);
  // GSO finishes the repair from To Be Repaired, exactly as for any damaged return.
  const returnId = (await one('SELECT id FROM employee_issuance_returns WHERE issuance_id = $1', [item.issuanceId])).id;
  await returnsRepository.resolveReturnRepair({ returnId, outcome: 'Repaired', note: 'Printer fixed', userId: 1 });
  assert.deepEqual(await one('SELECT condition, location, custody_status FROM asset_unit_tags WHERE id = $1', [item.tagIds[0]]), {
    condition: 'Good', location: 'GSO Storage', custody_status: 'Available',
  });
  assert.equal((await one('SELECT repair_outcome FROM employee_issuance_returns WHERE id = $1', [returnId])).repair_outcome, 'Repaired');
});

databaseTest('a paid lost unit leaves stock as lost, and its settlement is recorded as paid', async () => {
  const item = await issuedItem({ description: 'Tablet', tracking: 'individual', units: ['TAB-LOST-1'] });
  const id = await reportWith(213, 'LOST', [{ issuanceId: String(item.issuanceId), assetCode: 'TAB-LOST-1', quantity: 1, description: 'Tablet', remarks: '' }]);
  await payCase(id, '800');
  const tag = await one('SELECT tag_code, custody_status, lifecycle_status, location, issuance_id, assigned_employee_id FROM asset_unit_tags WHERE id = $1', [item.tagIds[0]]);
  assert.deepEqual(tag, {
    tag_code: 'TAB-LOST-1', custody_status: 'Available', lifecycle_status: 'Disposed', location: 'Lost', issuance_id: null, assigned_employee_id: null,
  }, 'a lost unit keeps its barcode and leaves the active stock');
  assert.deepEqual(await one('SELECT quantity FROM item_catalog WHERE id = $1', [item.itemId]), { quantity: 0 });
  const record = await one(
    'SELECT status, return_condition, quantity, settlement_status, settled_at IS NOT NULL AS settled FROM employee_issuance_returns WHERE issuance_id = $1',
    [item.issuanceId],
  );
  assert.deepEqual(record, { status: 'Lost', return_condition: 'Lost', quantity: 1, settlement_status: 'Paid', settled: true });
  assert.deepEqual(await one('SELECT returned_quantity, status FROM employee_issuances WHERE id = $1', [item.issuanceId]), { returned_quantity: 1, status: 'Returned' });
  assert.ok((await historyNotes(id)).some((note) => /Tablet \(barcode TAB-LOST-1\) removed from stock as lost\./.test(note)));
});

databaseTest('paid stock lines move by quantity: damaged ones are counted for repair, lost ones leave the stock', async () => {
  const item = await issuedItem({ description: 'Bond paper', tracking: 'quantity', quantity: 3 });
  const damaged = await reportWith(214, 'DAMAGED', [{ issuanceId: String(item.issuanceId), assetCode: item.itemCode, quantity: 2, description: 'Bond paper', remarks: '' }]);
  await payCase(damaged, '150');
  assert.deepEqual(await one('SELECT quantity, repair_quantity FROM item_catalog WHERE id = $1', [item.itemId]), { quantity: 3, repair_quantity: 2 });
  assert.deepEqual(await one('SELECT returned_quantity, status FROM employee_issuances WHERE id = $1', [item.issuanceId]), { returned_quantity: 2, status: 'Issued' });

  const lost = await reportWith(215, 'LOST', [{ issuanceId: String(item.issuanceId), assetCode: item.itemCode, quantity: 1, description: 'Bond paper', remarks: '' }]);
  await payCase(lost, '50');
  assert.deepEqual(await one('SELECT quantity, repair_quantity FROM item_catalog WHERE id = $1', [item.itemId]), { quantity: 2, repair_quantity: 2 });
  assert.deepEqual(await one('SELECT returned_quantity, status FROM employee_issuances WHERE id = $1', [item.issuanceId]), { returned_quantity: 3, status: 'Returned' });
  const records = await one(
    "SELECT COUNT(*)::INTEGER AS n FROM employee_issuance_returns WHERE issuance_id = $1 AND status = 'Lost' AND settlement_status = 'Paid' AND quantity = 1",
    [item.issuanceId],
  );
  assert.equal(records.n, 1);
  // GSO repairs the damaged units from To Be Repaired, which takes them out of the repair count again.
  const damagedReturn = (await one("SELECT id FROM employee_issuance_returns WHERE issuance_id = $1 AND status = 'Returned'", [item.issuanceId])).id;
  await returnsRepository.resolveReturnRepair({ returnId: damagedReturn, outcome: 'Repaired', note: 'Bond paper repaired', userId: 1 });
  assert.deepEqual(await one('SELECT quantity, repair_quantity FROM item_catalog WHERE id = $1', [item.itemId]), { quantity: 2, repair_quantity: 0 });
});

databaseTest('an item the requester no longer holds is not moved, the payment still counts, and GSO is told which item', async () => {
  const item = await issuedItem({ description: 'Projector', tracking: 'individual', units: ['PRJ-OLD-1'] });
  // The requester returned the unit before paying: the issuance is closed and the barcode is back in stock.
  await pool.query("UPDATE asset_unit_tags SET custody_status = 'Available', issuance_id = NULL, assigned_employee_id = NULL WHERE id = $1", [item.tagIds[0]]);
  await pool.query("UPDATE employee_issuances SET returned_quantity = 1, status = 'Returned' WHERE id = $1", [item.issuanceId]);
  const id = await reportWith(216, 'DAMAGED', [{ issuanceId: String(item.issuanceId), assetCode: 'PRJ-OLD-1', quantity: 1, description: 'Projector', remarks: '' }]);
  await payCase(id, '300');
  assert.equal((await lossDamage.getCase(id)).case.settlement.status, 'PAID');
  const tag = await one('SELECT tag_code, condition, custody_status FROM asset_unit_tags WHERE id = $1', [item.tagIds[0]]);
  assert.deepEqual(tag, { tag_code: 'PRJ-OLD-1', condition: 'Good', custody_status: 'Available' });
  assert.equal((await one('SELECT COUNT(*)::INTEGER AS n FROM employee_issuance_returns WHERE issuance_id = $1', [item.issuanceId])).n, 0);
  assert.ok((await historyNotes(id)).some((note) => /^Not moved, GSO to check: Projector \(its issuance is no longer active\)\.$/.test(note)));
});
