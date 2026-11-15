// PayMongo settings without keys, and the refusal of a live key. Each check runs in a child process, because the
// settings are read once per process and this file must not change the settings the other tests use.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const backendDir = path.join(__dirname, '..');
const baseEnv = {
  DATABASE_URL: 'postgres://postgres@127.0.0.1:1/not_used',
  JWT_SECRET: 'loss-damage-setup-secret-'.padEnd(40, 'x'),
  SMTP_HOST: '',
  SMTP_PORT: '',
  SMTP_USER: '',
  SMTP_PASS: '',
};

test('a live PayMongo key is refused when the backend starts', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./src/config/env')"], {
    cwd: backendDir,
    env: { ...process.env, ...baseEnv, PAYMONGO_SECRET_KEY: 'sk_live_must_never_be_used', PAYMONGO_WEBHOOK_SECRET: '' },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sk_test_/);
});

test('without PayMongo keys, the setup state says so, and payment links and webhooks are refused with a readable message', () => {
  const script = `
    const paymongo = require('./src/modules/loss-damage/paymongo');
    const service = require('./src/modules/loss-damage/loss-damage.service');
    (async () => {
      const state = paymongo.setupState();
      let linkError = null;
      try { await paymongo.createCheckoutSession({ referenceNumber: 'REQ-1', description: 'x', amountCentavos: 100, successUrl: 'https://x.test/a', cancelUrl: 'https://x.test/a', metadata: {} }); }
      catch (error) { linkError = { status: error.status, message: error.message, expose: error.expose === true }; }
      let webhookError = null;
      try { await service.receivePaymongoWebhook({ rawBody: Buffer.from('{}'), signature: 't=1,te=ab' }); }
      catch (error) { webhookError = { status: error.status, message: error.message, expose: error.expose === true }; }
      console.log(JSON.stringify({ state, linkError, webhookError }));
    })();
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: backendDir,
    env: { ...process.env, ...baseEnv, PAYMONGO_SECRET_KEY: '', PAYMONGO_WEBHOOK_SECRET: '' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const answers = JSON.parse(result.stdout.trim().split('\n').pop());
  assert.deepEqual(answers.state, { paymentLinks: false, webhook: false });
  assert.equal(answers.linkError.status, 503);
  assert.equal(answers.linkError.expose, true, 'the setup message reaches the screen instead of a generic server error');
  assert.match(answers.linkError.message, /PAYMONGO_SECRET_KEY/);
  assert.equal(answers.webhookError.status, 503);
  assert.match(answers.webhookError.message, /PAYMONGO_WEBHOOK_SECRET/);
});
