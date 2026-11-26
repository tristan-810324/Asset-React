const repository = require('./charges.repository');
const auditRepository = require('../audit/audit.repository');
const requesterAlerts = require('../notifications/requester-alerts');

const invalid = (message, status = 400) => Object.assign(new Error(message), { status });
const KINDS = new Set(['FACILITY', 'RETURN', 'LOSS']);
// The same image limit as the requester profile picture.
const MAX_RECEIPT_CHARS = 1_400_000;
const RECEIPT_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

function validateCharge(kindValue, refValue) {
  const kind = String(kindValue || '');
  if (!KINDS.has(kind)) throw invalid('Invalid charge type.', 404);
  const ref = String(refValue || '');
  if (!/^\d{1,18}$/.test(ref)) throw invalid('Invalid charge.', 404);
  return { kind, ref };
}

async function listCharges() {
  const rows = await repository.listCharges();
  return rows.map((row) => ({ ...row, status: row.paid ? 'Paid' : 'To pay' }));
}

async function getReceipt(kindValue, refValue) {
  const { kind, ref } = validateCharge(kindValue, refValue);
  const receipt = await repository.getReceipt(kind, ref);
  if (!receipt) throw invalid('No receipt for this charge.', 404);
  return receipt;
}

// The file's first bytes must match its declared type, so a PDF or text file renamed to .png is refused.
// shortcut: checks only the file header, not the whole picture, upgrade if a crafted file gets through.
function hasImageSignature(receiptData) {
  const [header, body] = receiptData.split(',');
  const bytes = Buffer.from(body.slice(0, 16), 'base64');
  if (header === 'data:image/png;base64') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (header === 'data:image/jpeg;base64') return bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (header === 'data:image/webp;base64') return bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP';
  return false;
}

async function payCharge(kindValue, refValue, input, user) {
  const { kind, ref } = validateCharge(kindValue, refValue);
  const receiptData = input && typeof input === 'object' && typeof input.receiptData === 'string' ? input.receiptData : '';
  if (!receiptData) throw invalid('Upload a photo or screenshot of the receipt first.');
  if (receiptData.length > MAX_RECEIPT_CHARS) throw invalid('The receipt image must be 1 MB or smaller. Try a screenshot or a smaller photo.');
  if (!RECEIPT_PATTERN.test(receiptData) || !hasImageSignature(receiptData)) {
    throw invalid('That file is not a JPG, PNG, or WebP image. Upload a photo or screenshot of the receipt.');
  }
  const amountPaid = parseAmount(input.amountPaid);
  const receiptName = typeof input.receiptName === 'string' ? input.receiptName.trim().slice(0, 200) : '';
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';

  const charge = await repository.payCharge({ kind, ref, receiptData, receiptName, note, userId: user.id, amountPaid });

  // The requester is told the charge is settled, in the app and by email; the receipt shows in their request details.
  const recipient = await repository.findChargeRecipient(kind, ref);
  await requesterAlerts.notifyRequester({
    userId: recipient?.userId,
    employeeCode: recipient?.employeeCode,
    employeeEmail: recipient?.employeeEmail,
    title: 'Your payment is settled',
    message: `Your payment of ${pesoText(amountPaid)} for ${charge.itemName || 'the damaged item'} is recorded and settled by GSO. The receipt is in your request details.`,
    href: recipient?.requestId ? `/requester/requests/${recipient.requestId}` : '/requester/my-requests',
    dedupeKey: `charge-settled:${kind}:${ref}`,
  });

  // The uploader is recorded in the audit log, so a fake receipt traces back to the staff member who uploaded it.
  await auditRepository.writeLog(null, {
    entityType: 'request',
    entityKey: String(charge.referenceNo || ref),
    entityName: charge.itemName || String(charge.referenceNo || ref),
    action: 'updated',
    reason: `Payment of ${pesoText(amountPaid)} (estimated ${pesoText(charge.amount)}) for ${charge.itemName || 'the item'} (${charge.personName || 'requester'}) marked Paid. Receipt uploaded by ${user.name || 'GSO Staff'}${receiptName ? ` (${receiptName})` : ''}.`,
    newValues: { chargeKind: kind, chargeRef: String(ref), paid: true, receiptName, amountPaid },
    changedByUserId: user.id,
  });
  return { kind, ref, status: 'Paid' };
}

// The amount written on the receipt: a positive peso amount with at most two decimals.
const MAX_AMOUNT = 100_000_000;
function parseAmount(value) {
  const amount = typeof value === 'string' ? Number(value.trim()) : value;
  const valid = typeof amount === 'number' && Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT && Number(amount.toFixed(2)) === amount;
  if (!valid) throw invalid('Enter the amount written on the receipt, in pesos (for example 1500.00).');
  return amount;
}
const pesoText = (value) => Number(value || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });

// A waived charge needs proof, not a payment: a PDF, or a JPG, PNG, or WebP picture of the signed waiver.
const PROOF_PATTERN = /^data:(?:image\/(?:jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/]+={0,2}$/;
function proofMimeOf(proofData) {
  if (!PROOF_PATTERN.test(proofData)) return null;
  const mime = proofData.slice('data:'.length, proofData.indexOf(';'));
  if (mime === 'application/pdf') {
    const head = Buffer.from(proofData.split(',')[1].slice(0, 8), 'base64').toString('latin1', 0, 4);
    return head === '%PDF' ? mime : null;
  }
  return hasImageSignature(proofData) ? mime : null;
}

async function listWaivedCharges() {
  const rows = await repository.listWaivedCharges();
  return rows.map((row) => ({ ...row, status: 'Waived' }));
}

async function getWaiverProof(kindValue, refValue) {
  const { kind, ref } = validateCharge(kindValue, refValue);
  const proof = await repository.getWaiverProof(kind, ref);
  if (!proof) throw invalid('No proof attached for this waived item yet.', 404);
  return proof;
}

async function saveWaiverProof(kindValue, refValue, input, user) {
  const { kind, ref } = validateCharge(kindValue, refValue);
  const proofData = input && typeof input === 'object' && typeof input.proofData === 'string' ? input.proofData : '';
  if (!proofData) throw invalid('Attach a PDF or a picture of the signed waiver first.');
  if (proofData.length > MAX_RECEIPT_CHARS) throw invalid('The file must be 1 MB or smaller. Try a smaller picture, or a PDF with fewer pages.');
  const proofMime = proofMimeOf(proofData);
  if (!proofMime) throw invalid('That file is not a PDF, JPG, PNG, or WebP. Attach the signed waiver as one of these.');
  const proofName = typeof input.proofName === 'string' ? input.proofName.trim().slice(0, 200) : '';
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';

  const waived = await repository.saveWaiverProof({ kind, ref, proofData, proofName, proofMime, note, userId: user.id });

  await auditRepository.writeLog(null, {
    entityType: 'request',
    entityKey: String(waived.referenceNo || ref),
    entityName: waived.itemName || String(waived.referenceNo || ref),
    action: 'updated',
    reason: `Waiver proof attached for ${waived.itemName || 'the item'} (${waived.personName || 'requester'}) by ${user.name || 'GSO Staff'}${proofName ? ` (${proofName})` : ''}.`,
    newValues: { chargeKind: kind, chargeRef: String(ref), waiverProof: true, proofName },
    changedByUserId: user.id,
  });
  return { kind, ref, status: 'Waived', proofAttached: true };
}

module.exports = { listCharges, getReceipt, payCharge, listWaivedCharges, getWaiverProof, saveWaiverProof };
