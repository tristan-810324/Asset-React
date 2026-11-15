// PayMongo TEST mode for Loss & Damage payments. New payments use a Checkout Session (Hosted Checkout) that offers
// GCash only, so no QR code is shown. Older Payment Link cases (link_...) still settle through the same webhook.
// env.js refuses any key that is not a test secret key (sk_test_).
// API: https://docs.paymongo.com/reference/create_checkout_sessions (v1; the expire endpoint is documented for v1).
const crypto = require('node:crypto');
const env = require('../../config/env');

const API_BASE = 'https://api.paymongo.com/v1';
const REQUEST_TIMEOUT_MS = 15000;
// PayMongo retries a failed delivery many times and may keep the first timestamp, so the age limit is wide.
// A replayed event still cannot settle a case twice: its event id (or payment id) is stored and checked first.
const SIGNATURE_MAX_AGE_SECONDS = 3 * 24 * 60 * 60;
const SIGNATURE_MAX_FUTURE_SECONDS = 5 * 60;
const PAYMENT_METHOD_TYPES = ['gcash'];

const SETUP_MESSAGE = 'PayMongo test setup is not finished. Add PAYMONGO_SECRET_KEY (it starts with sk_test_) to the backend settings, then restart the backend.';

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

function setupState() {
  return { paymentLinks: Boolean(env.paymongo.secretKey), webhook: Boolean(env.paymongo.webhookSecret) };
}

function webhookSecret() {
  return env.paymongo.webhookSecret;
}

async function callPaymongo(method, path, body) {
  if (!env.paymongo.secretKey) throw httpError(503, SETUP_MESSAGE);
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        // Basic auth: the secret key is the username and the password is empty.
        Authorization: `Basic ${Buffer.from(`${env.paymongo.secretKey}:`).toString('base64')}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw httpError(502, 'PayMongo could not be reached. Check the internet connection, then try again.');
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = [payload?.errors?.[0]?.detail, payload?.error?.message, payload?.message]
      .find((value) => typeof value === 'string' && value.trim());
    console.error('PayMongo refused a request.', { method, status: response.status });
    throw httpError(502, `PayMongo did not accept the request${detail ? `: ${detail}` : '.'}`);
  }
  return payload;
}

function isHttpsUrl(value) {
  try {
    return typeof value === 'string' && new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

// One Checkout Session per case, paid with GCash only. The body is wrapped in data.attributes, as this API requires.
async function createCheckoutSession({ referenceNumber, description, amountCentavos, successUrl, cancelUrl, metadata }) {
  const payload = await callPaymongo('POST', '/checkout_sessions', {
    data: {
      attributes: {
        line_items: [{
          name: description,
          amount: amountCentavos,
          currency: 'PHP',
          quantity: 1,
          description: 'A.S.SET test payment. No real money is charged.',
        }],
        payment_method_types: PAYMENT_METHOD_TYPES,
        success_url: successUrl,
        cancel_url: cancelUrl,
        reference_number: referenceNumber,
        description,
        metadata,
        send_email_receipt: false,
      },
    },
  });
  const session = payload?.data || {};
  const attributes = session.attributes || {};
  const id = typeof session.id === 'string' ? session.id : '';
  const checkoutUrl = attributes.checkout_url;
  if (attributes.livemode === true) {
    await expireCheckoutSession(id).catch(() => undefined);
    throw httpError(502, 'PayMongo made a LIVE checkout, so it was cancelled. Use a test secret key (sk_test_).');
  }
  if (!id.startsWith('cs_') || !isHttpsUrl(checkoutUrl)) throw httpError(502, 'PayMongo answered without a checkout page. Try again.');
  return { id, checkoutUrl, referenceNumber };
}

// The success redirect is not proof of payment. This server-side read is a recovery path for
// environments where PayMongo cannot deliver the webhook (for example, a local backend).
async function getCheckoutSession(sessionId) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(String(sessionId || ''))) {
    throw httpError(400, 'The PayMongo checkout session is not valid.');
  }
  return callPaymongo('GET', `/checkout_sessions/${encodeURIComponent(sessionId)}`);
}

// Expires an open Checkout Session so it can no longer be paid. PayMongo refuses when it already has a payment.
async function expireCheckoutSession(sessionId) {
  await callPaymongo('POST', `/checkout_sessions/${encodeURIComponent(sessionId)}/expire`);
}

// Cancels whichever PayMongo payment the case has: a Checkout Session (cs_...) or an older Payment Link (link_...).
async function cancelPaymentCheckout(id) {
  if (id.startsWith('cs_')) return expireCheckoutSession(id);
  return archivePaymentLink(id);
}

// Old Payment Link cases only. An archived link can no longer be paid.
async function archivePaymentLink(linkId) {
  await callPaymongo('PATCH', `/payment_links/${encodeURIComponent(linkId)}`, { archive: true });
}

// Header "Paymongo-Signature: t=<timestamp>,te=<test signature>,li=<live signature>". The signature is an HMAC-SHA256
// of "<timestamp>.<raw body>" with the webhook secret. Only the test signature (te) is accepted.
// PayMongo's docs do not name the encoding; hex is what their examples produce, and base64 is accepted too.
function verifySignature(rawBody, header, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = {};
  for (const part of String(header || '').split(',')) {
    const index = part.indexOf('=');
    if (index > 0) parts[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  const timestamp = parts.t || '';
  const given = /^[0-9a-f]+$/i.test(parts.te || '') ? parts.te.toLowerCase() : (parts.te || '');
  if (!secret || !/^\d{1,12}$/.test(timestamp) || !given || !Buffer.isBuffer(rawBody)) return 'invalid';
  const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest();
  const givenBytes = Buffer.from(given);
  const matches = [digest.toString('hex'), digest.toString('base64')].some((encoded) => {
    const expectedBytes = Buffer.from(encoded);
    return expectedBytes.length === givenBytes.length && crypto.timingSafeEqual(expectedBytes, givenBytes);
  });
  if (!matches) return 'invalid';
  const age = nowSeconds - Number(timestamp);
  if (age > SIGNATURE_MAX_AGE_SECONDS || age < -SIGNATURE_MAX_FUTURE_SECONDS) return 'expired';
  return 'valid';
}

const integerOrNull = (value) => (Number.isInteger(value) ? value : null);

function dateOrNull(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value * 1000);
  if (typeof value === 'string' && value.trim() && !Number.isNaN(Date.parse(value))) return new Date(value);
  return null;
}

// Reads what the webhook needs. PayMongo sends the same resource in two envelopes, and both are accepted:
//   A (events page): { data: { id: "evt_...", type: "event", attributes: { type, livemode, data: <resource> } } }
//   B (Hosted Checkout guide): { event_type, data: { type: "<event name>", livemode, data: <resource> } }
// The resource is a checkout session (cs_...) or an older link (link_...). Its payments carry the paid amount.
function readEvent(body) {
  const envelope = body?.data || {};
  const isEnvelopeA = envelope.type === 'event' && envelope.attributes && typeof envelope.attributes === 'object';
  const attributes = isEnvelopeA ? envelope.attributes : {};
  const eventType = isEnvelopeA ? attributes.type : envelope.type;
  const eventLivemode = isEnvelopeA ? attributes.livemode : envelope.livemode;
  const resource = (isEnvelopeA ? attributes.data : envelope.data) || {};
  const details = resource.attributes || resource;
  const payments = (Array.isArray(details.payments) ? details.payments : []).map((entry) => entry?.data || entry).filter(Boolean);
  const payment = payments.find((entry) => (entry.attributes?.status || entry.status) === 'paid') || null;
  const paid = payment?.attributes || payment || {};
  return {
    eventId: typeof envelope.id === 'string' ? envelope.id : '',
    eventType: typeof eventType === 'string' ? eventType : '',
    livemode: typeof eventLivemode === 'boolean' ? eventLivemode : (typeof details.livemode === 'boolean' ? details.livemode : null),
    linkId: typeof resource.id === 'string' ? resource.id : '',
    linkAmount: integerOrNull(details.amount),
    currency: typeof details.currency === 'string' ? details.currency : '',
    paymentId: typeof payment?.id === 'string' ? payment.id : null,
    paymentAmount: integerOrNull(paid.amount),
    paymentCurrency: typeof paid.currency === 'string' ? paid.currency : '',
    paidAt: dateOrNull(paid.paid_at) || dateOrNull(attributes.created_at),
  };
}

module.exports = {
  SETUP_MESSAGE,
  setupState,
  webhookSecret,
  createCheckoutSession,
  getCheckoutSession,
  cancelPaymentCheckout,
  archivePaymentLink,
  verifySignature,
  readEvent,
};
