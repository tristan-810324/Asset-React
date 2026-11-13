// The Finance PDF is written by hand, so these checks read its structure: header, xref offsets, pages, and text.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPurchaseRequisitionPdf } = require('../src/modules/requests/purchase-requisition-pdf');

const requestWith = (items) => ({
  referenceNo: 'REQ-2026-00013',
  requesterName: 'Requester One',
  requesterEmail: 'requester@invalid',
  createdAt: '2026-11-13T07:00:00Z',
  gsoHeadEndorsedAt: '2026-11-13T07:26:00Z',
  staffReviewedBy: 'GSO Staff One',
  staffReviewedAt: '2026-11-13T07:10:00Z',
  formData: {
    requesterName: 'Requester One',
    requesterEmployeeCode: 'EMP-3',
    departmentOrganization: 'COA - College of Accountancy',
    requesterPosition: 'Head',
    requiredDate: '2026-11-20',
    urgency: 'Urgent',
    urgentReason: 'Lab is closed',
    purpose: 'Replacement of damaged units for the lab.',
    remarks: '',
    items,
  },
});
const keyboard = { itemName: 'Keyboard', category: 'COMPUTER_PERIPHERALS', quantity: 49, requestedQuantity: 50, stockAvailableQuantity: 1, description: 'good quality and smooth for typing' };
const printer = { itemName: 'Printer', category: 'COMPUTER_PERIPHERALS', quantity: 2, requestedQuantity: 2, stockAvailableQuantity: 0, description: '' };

// Every cross-reference entry must point at the object it names.
function assertXrefOffsets(text) {
  const xrefStart = Number(text.match(/startxref\n(\d+)/)[1]);
  const header = text.slice(xrefStart).match(/^xref\n0 (\d+)\n/);
  const count = Number(header[1]);
  const entries = xrefStart + header[0].length;
  for (let id = 1; id < count; id += 1) {
    const entry = text.slice(entries + id * 20, entries + (id + 1) * 20);
    if (entry.endsWith(' n \n')) assert.ok(text.startsWith(`${id} 0 obj`, Number(entry.slice(0, 10))), `object ${id} offset`);
  }
}

test('the Finance PDF has a valid structure, the logo, the items, and the endorsement', () => {
  const pdf = buildPurchaseRequisitionPdf({ request: requestWith([keyboard, printer]), endorsedBy: 'DYCI GSO Head', endorsedEmail: 'gsohead@dyci.edu.ph' });
  const text = pdf.toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.match(text, /\/Subtype \/Image \/Width 558 \/Height 288/);
  assert.match(text, /\/Count 1\b/);
  assert.ok(text.includes('(Keyboard) Tj'));
  assert.ok(text.includes('(Reference REQ-2026-00013) Tj'));
  assert.ok(text.includes('(DYCI GSO Head) Tj'));
  assertXrefOffsets(text);
});

test('a long item list continues on more pages with the page count in the footer', () => {
  const many = Array.from({ length: 60 }, (_value, index) => ({ ...keyboard, itemName: `Keyboard ${index + 1}` }));
  const text = buildPurchaseRequisitionPdf({ request: requestWith(many), endorsedBy: 'DYCI GSO Head', endorsedEmail: '' }).toString('latin1');
  const pages = Number(text.match(/\/Count (\d+)/)[1]);
  assert.ok(pages > 1, 'more than one page');
  assert.ok(text.includes(`(Page 1 of ${pages}) Tj`) || text.includes(`(Page ${pages} of ${pages}) Tj`));
  assertXrefOffsets(text);
});

test('a request with no items still builds a readable PDF', () => {
  const text = buildPurchaseRequisitionPdf({ request: requestWith([]), endorsedBy: '', endorsedEmail: '' }).toString('latin1');
  assert.ok(text.includes('(No items recorded.) Tj'));
  assertXrefOffsets(text);
});
