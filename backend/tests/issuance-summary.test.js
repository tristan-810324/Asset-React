// Pure tests for the issuance email grouping. They need no database: run with
//   node --test tests/issuance-summary.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { groupIssuanceLines, describeCodes } = require('../src/modules/issuances/issuance-summary');

const unit = (number, overrides = {}) => ({
  itemName: 'goojodoq mouse purple',
  itemCode: `AST-CPP-00${String(10 + number).padStart(2, '0')}`,
  quantity: 1,
  unitOfMeasure: 'piece',
  condition: 'New',
  trackingMode: 'individual',
  issueBehavior: 'returnable',
  recipientEmployeeCode: '2024-1123',
  recipientEmployeeName: 'tristan ivan Samson bautista',
  recipientLocation: 'building A — room 201',
  recipientPurpose: '',
  ...overrides,
});

test('50 units with the same recipient and location are one line with a code range', () => {
  const items = Array.from({ length: 50 }, (_unused, index) => unit(index + 1));
  const lines = groupIssuanceLines(items);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 50);
  assert.equal(describeCodes(lines[0].codes), 'AST-CPP-0011 to AST-CPP-0060 (50 codes)');
});

test('units for different recipients or locations stay on separate lines', () => {
  const items = [unit(1), unit(2), unit(3, { recipientEmployeeCode: '2024-2000', recipientEmployeeName: 'Maria Cruz' }), unit(4, { recipientLocation: 'building B — room 5' })];
  const lines = groupIssuanceLines(items);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map((line) => line.quantity), [2, 1, 1]);
});

test('a stock line keeps its single code and its total quantity', () => {
  const lines = groupIssuanceLines([
    { itemName: 'Bond paper', itemCode: 'AST-OE-0002', quantity: 3, unitOfMeasure: 'ream', condition: 'Good', trackingMode: 'quantity', issueBehavior: 'consumable', recipientEmployeeCode: '2024-1123', recipientEmployeeName: 'tristan ivan Samson bautista', recipientLocation: '', recipientPurpose: '' },
    { itemName: 'Bond paper', itemCode: 'AST-OE-0002', quantity: 2, unitOfMeasure: 'ream', condition: 'Good', trackingMode: 'quantity', issueBehavior: 'consumable', recipientEmployeeCode: '2024-1123', recipientEmployeeName: 'tristan ivan Samson bautista', recipientLocation: '', recipientPurpose: '' },
  ]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 5);
  assert.deepEqual(lines[0].codes, ['AST-OE-0002']);
  assert.equal(describeCodes(lines[0].codes), 'AST-OE-0002');
});

test('up to five codes are listed in full; more than five show the range', () => {
  assert.equal(describeCodes(['A-1', 'A-2', 'A-3', 'A-4', 'A-5']), 'A-1, A-2, A-3, A-4, A-5');
  assert.equal(describeCodes(['A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6']), 'A-1 to A-6 (6 codes)');
});
