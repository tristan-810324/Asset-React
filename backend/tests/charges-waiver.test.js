// The amount written on a receipt, and the proof attached to a waived charge. The repository and audit writer are replaced, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const backend = path.resolve(__dirname, '..');
const savedCharges = [];
const savedProofs = [];
function stubModule(relativePath, exportsObject) {
  const filename = require.resolve(path.join(backend, relativePath));
  require.cache[filename] = { id: filename, filename, loaded: true, exports: exportsObject };
}
stubModule('src/modules/charges/charges.repository.js', {
  findCharge: async () => ({ paid: false }),
  payCharge: async (args) => {
    savedCharges.push(args);
    return { amount: 58500, itemName: 'Laptop', referenceNo: '2026-CPP-012-0007', personName: 'Requester' };
  },
  listCharges: async () => [],
  getReceipt: async () => null,
  listWaivedCharges: async () => [],
  getWaiverProof: async () => null,
  saveWaiverProof: async (args) => {
    savedProofs.push(args);
    return { referenceNo: '2026-CPP-012-0007', itemName: 'Laptop', personName: 'Requester' };
  },
});
stubModule('src/modules/audit/audit.repository.js', { writeLog: async () => {} });
const { payCharge, saveWaiverProof } = require('../src/modules/charges/charges.service');

const user = { id: 1, name: 'GSO Staff' };
const dataUrl = (mime, bytes) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const PDF = Buffer.from('%PDF-1.4 signed waiver');
const receipt = dataUrl('image/png', PNG);
const refusedWith = (pattern) => (error) => error.status === 400 && pattern.test(error.message);

test('the amount on the receipt is required and must be a peso amount', async () => {
  const before = savedCharges.length;
  for (const amountPaid of [undefined, '', '0', '-5', 'abc', '10.005', 1e9]) {
    await assert.rejects(payCharge('RETURN', '1', { receiptData: receipt, receiptName: 'r', amountPaid }, user), refusedWith(/Enter the amount written on the receipt/), String(amountPaid));
  }
  assert.equal(savedCharges.length, before);
});

test('a valid amount is saved with the receipt, even when it differs from the estimate', async () => {
  const result = await payCharge('RETURN', '1', { receiptData: receipt, receiptName: 'r', amountPaid: '1500.5' }, user);
  assert.equal(result.status, 'Paid');
  assert.equal(savedCharges.at(-1).amountPaid, 1500.5);
});

test('a waiver proof must be a PDF or a picture, and a renamed file is refused', async () => {
  const before = savedProofs.length;
  await assert.rejects(saveWaiverProof('RETURN', '1', {}, user), refusedWith(/Attach a PDF or a picture/));
  await assert.rejects(saveWaiverProof('RETURN', '1', { proofData: 'data:text/plain;base64,aGVsbG8=' }, user), refusedWith(/not a PDF, JPG, PNG, or WebP/));
  await assert.rejects(saveWaiverProof('RETURN', '1', { proofData: dataUrl('application/pdf', 'hello, not a pdf') }, user), refusedWith(/not a PDF, JPG, PNG, or WebP/));
  await assert.rejects(saveWaiverProof('RETURN', '1', { proofData: dataUrl('image/png', 'hello, not a picture') }, user), refusedWith(/not a PDF, JPG, PNG, or WebP/));
  assert.equal(savedProofs.length, before);
});

test('a real PDF or picture is saved as the waiver proof', async () => {
  await saveWaiverProof('RETURN', '1', { proofData: dataUrl('application/pdf', PDF), proofName: 'waiver.pdf', note: 'Signed' }, user);
  await saveWaiverProof('RETURN', '1', { proofData: receipt, proofName: 'waiver.png' }, user);
  assert.deepEqual(savedProofs.map((proof) => proof.proofMime), ['application/pdf', 'image/png']);
  assert.equal(savedProofs[0].note, 'Signed');
});

test('a proof over the size limit is refused', async () => {
  const proofData = `data:application/pdf;base64,${'A'.repeat(1_400_001)}`;
  await assert.rejects(saveWaiverProof('RETURN', '1', { proofData }, user), refusedWith(/1 MB or smaller/));
});
