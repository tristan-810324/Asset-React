// The GSO Head's signature: which files are accepted, and how it appears on the printed Finance PDF. No database needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

Object.assign(process.env, {
  DATABASE_URL: 'postgres://postgres@127.0.0.1:1/signature_unit_test',
  JWT_SECRET: 'signature-unit-test-secret-'.padEnd(40, 'x'),
  SMTP_HOST: '',
  SMTP_PORT: '',
  SMTP_USER: '',
  SMTP_PASS: '',
});
const { readSignatureImage } = require('../src/modules/signatures/signatures.service');
const { buildPurchaseRequisitionPdf } = require('../src/modules/requests/purchase-requisition-pdf');

// The school logo is a PNG, so it stands in for a signature image here.
const samplePng = fs.readFileSync(path.join(__dirname, '../src/assets/gso-logo.png'));
const request = {
  referenceNo: 'REQ-2026-00099',
  requesterName: 'Requester One',
  requesterEmail: 'requester@invalid',
  createdAt: '2026-11-13T07:00:00Z',
  gsoHeadEndorsedAt: '2026-11-13T07:26:00Z',
  formData: { purpose: 'Lab setup', items: [] },
};

function assertXrefOffsets(text) {
  const xrefStart = Number(text.match(/startxref\n(\d+)/)[1]);
  const header = text.slice(xrefStart).match(/^xref\n0 (\d+)\n/);
  const entries = xrefStart + header[0].length;
  for (let id = 1; id < Number(header[1]); id += 1) {
    const entry = text.slice(entries + id * 20, entries + (id + 1) * 20);
    if (entry.endsWith(' n \n')) assert.ok(text.startsWith(`${id} 0 obj`, Number(entry.slice(0, 10))), `object ${id} offset`);
  }
}

test('a PNG signature is accepted and its size is read', () => {
  const image = readSignatureImage(`data:image/png;base64,${samplePng.toString('base64')}`);
  assert.equal(image.width, 558);
  assert.equal(image.height, 288);
});

test('only PNG files under 300 KB are accepted', () => {
  assert.throws(() => readSignatureImage(Buffer.from('not an image').toString('base64')),
    (error) => error.status === 400 && /Upload a PNG/.test(error.message));
  assert.throws(() => readSignatureImage(Buffer.concat([samplePng, Buffer.alloc(300 * 1024)]).toString('base64')),
    (error) => error.status === 400 && /larger than 300 KB/.test(error.message));
  assert.throws(() => readSignatureImage(''), /Choose a PNG/);
});

test('a saved signature appears on the printed Finance PDF above the GSO Head line', () => {
  const text = buildPurchaseRequisitionPdf({ request, endorsedBy: 'DYCI GSO Head', endorsedEmail: 'gsohead@dyci.edu.ph', signaturePng: samplePng }).toString('latin1');
  assert.match(text, /\/XObject << \/Logo 5 0 R \/Sig 6 0 R >>/);
  assert.ok(text.includes('(\\(Electronically signed\\)) Tj'));
  assertXrefOffsets(text);
});

test('without a saved signature the approval line stays blank', () => {
  const text = buildPurchaseRequisitionPdf({ request, endorsedBy: 'DYCI GSO Head', endorsedEmail: '', signaturePng: null }).toString('latin1');
  assert.ok(!text.includes('/Sig '));
  assert.ok(text.includes('(\\(Signature\\)) Tj'));
  assertXrefOffsets(text);
});
