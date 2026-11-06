const countsRepository = require('./counts.repository');

function invalid(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

// A blind count: GSO enters what is physically on the shelves without seeing the expected
// numbers, and only then gets the differences. Scanned unit barcodes are checked one by one.
async function submitCount(input, user) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Hindi valid ang inventory count.');
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > 1000) invalid('Hindi dapat lumampas sa 1000 characters ang notes.');
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 5000) invalid('Ilagay ang bilang ng kahit isang item.');
  const counted = new Map();
  for (const entry of input.items) {
    const itemId = String(entry?.itemId ?? '');
    const quantity = Number(entry?.countedQuantity);
    if (!/^\d{1,20}$/.test(itemId)) invalid('Hindi valid ang item sa count.');
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 2147483647) invalid('Ang bilang ay dapat whole number na 0 o higit pa.');
    counted.set(itemId, quantity);
  }
  const scannedTags = new Set((Array.isArray(input.scannedTagCodes) ? input.scannedTagCodes : [])
    .filter((code) => typeof code === 'string' && code.trim())
    .map((code) => code.trim().toUpperCase()));
  if (scannedTags.size > 20000) invalid('Masyadong maraming na-scan na barcode sa isang count.');

  const expected = await countsRepository.listExpectedOnHand();
  const tagsByCode = new Map(expected.tags.map((tag) => [tag.tagCode, tag]));
  const lines = expected.items
    .filter((item) => counted.has(item.itemId))
    .map((item) => {
      const expectedQuantity = Number(item.expected);
      const countedQuantity = counted.get(item.itemId);
      return { ...item, expected: expectedQuantity, counted: countedQuantity, difference: countedQuantity - expectedQuantity };
    });
  if (lines.length !== counted.size) invalid('May item sa count na wala na sa inventory. I-refresh ang listahan.');

  // Tag checks only for items whose units were scanned in this count.
  const scannedItemIds = new Set([...scannedTags].map((code) => tagsByCode.get(code)?.itemId).filter(Boolean));
  const tagFindings = [];
  for (const code of scannedTags) {
    const tag = tagsByCode.get(code);
    if (!tag) tagFindings.push({ tagCode: code, finding: 'Unknown barcode' });
    else if (tag.lifecycleStatus === 'Disposed') tagFindings.push({ tagCode: code, finding: 'Recorded as disposed or lost, but found on the shelf' });
    else if (tag.custodyStatus !== 'Available') tagFindings.push({ tagCode: code, finding: 'Recorded as with an employee, but found on the shelf' });
  }
  for (const tag of expected.tags) {
    if (scannedItemIds.has(tag.itemId) && tag.custodyStatus === 'Available' && tag.lifecycleStatus !== 'Disposed' && !scannedTags.has(tag.tagCode)) {
      tagFindings.push({ tagCode: tag.tagCode, finding: 'Recorded as in storage, but not found' });
    }
  }

  const discrepancyCount = lines.filter((line) => line.difference !== 0).length + tagFindings.length;
  const saved = await countsRepository.saveCount({
    userId: user.id,
    note,
    lines: { items: lines, tagFindings },
    discrepancyCount,
  });
  return { ...saved, note, countedBy: user.name || user.email, discrepancyCount, lines: { items: lines, tagFindings } };
}

async function listCounts() {
  return countsRepository.listCounts();
}

module.exports = { submitCount, listCounts };
