// Groups the lines of an issuance email. Units with the same item, condition, recipient, and location become one line,
// so a batch of 50 mice is one line with a range of asset codes instead of 50 blocks. Pure functions, no database.

// Units that match on everything the email shows are one line; the codes are kept so the range can be printed.
function groupIssuanceLines(items) {
  const groups = new Map();
  for (const item of items) {
    const key = [
      item.itemName, item.unitOfMeasure, item.trackingMode, item.issueBehavior, item.condition,
      item.recipientEmployeeCode, item.recipientLocation || '', item.recipientPurpose || '',
    ].join('|');
    const group = groups.get(key) || { ...item, quantity: 0, codes: new Set() };
    group.quantity += Number(item.quantity);
    group.codes.add(item.itemCode);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({ ...group, codes: [...group.codes].sort() }));
}

// Up to five codes are listed; beyond that, the first and last code with the count. shortcut: the range hides gaps between codes (the count is exact), upgrade if staff must check every code from the email.
function describeCodes(codes) {
  if (codes.length <= 5) return codes.join(', ');
  return `${codes[0]} to ${codes[codes.length - 1]} (${codes.length} codes)`;
}

module.exports = { groupIssuanceLines, describeCodes };
