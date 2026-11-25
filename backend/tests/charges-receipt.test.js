// Receipt checks when a charge is marked Paid. The repository and audit writer are replaced, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const backend = path.resolve(__dirname, '..');
const saved = [];
function stubModule(relativePath, exportsObject) {
  const filename = require.resolve(path.join(backend, relativePath));
  require.cache[filename] = { id: filename, filename, loaded: true, exports: exportsObject };
}
stubModule('src/modules/charges/charges.repository.js', {
  findCharge: async () => ({ paid: false }),
  payCharge: async (args) => {
    saved.push(args);
    return { amount: 100500, itemName: 'Laptop', referenceNo: '2026-CPP-012-0007', personName: 'Requester' };
  },
  listCharges: async () => [],
  getReceipt: async () => null,
});
stubModule('src/modules/audit/audit.repository.js', { writeLog: async () => {} });
const { payCharge } = require('../src/modules/charges/charges.service');

const user = { id: 1, name: 'GSO Staff' };
const dataUrl = (mime, bytes) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const refusedWith = (pattern) => (error) => error.status === 400 && pattern.test(error.message);

test('a missing or empty receipt is refused before anything is saved', async () => {
  const before = saved.length;
  await assert.rejects(payCharge('RETURN', '1', {}, user), refusedWith(/Upload a photo or screenshot/));
  await assert.rejects(payCharge('RETURN', '1', { receiptData: '' }, user), refusedWith(/Upload a photo or screenshot/));
  await assert.rejects(payCharge('RETURN', '1', undefined, user), refusedWith(/Upload a photo or screenshot/));
  assert.equal(saved.length, before);
});

test('a PDF or text file is refused, even when it is renamed to .png', async () => {
  const before = saved.length;
  const files = {
    'a real PDF': dataUrl('application/pdf', '%PDF-1.4 real'),
    'a PDF renamed to .png': dataUrl('image/png', '%PDF-1.4 renamed'),
    'text labeled as PNG': dataUrl('image/png', 'hello, this is not a picture'),
  };
  for (const [label, receiptData] of Object.entries(files)) {
    await assert.rejects(payCharge('RETURN', '1', { receiptData }, user), refusedWith(/not a JPG, PNG, or WebP image/), label);
  }
  assert.equal(saved.length, before);
});

test('a receipt over the size limit is refused', async () => {
  const receiptData = `data:image/png;base64,${'A'.repeat(1_400_001)}`;
  await assert.rejects(payCharge('RETURN', '1', { receiptData }, user), refusedWith(/1 MB or smaller/));
});

test('a real PNG, JPEG, or WebP is accepted and the charge is marked Paid', async () => {
  for (const [mime, bytes] of [['image/png', PNG], ['image/jpeg', JPEG], ['image/webp', WEBP]]) {
    const result = await payCharge('RETURN', '1', { receiptData: dataUrl(mime, bytes), receiptName: 'receipt', amountPaid: '58500.00' }, user);
    assert.equal(result.status, 'Paid');
  }
});
