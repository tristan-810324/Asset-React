const repository = require('./charges.repository');
const auditRepository = require('../audit/audit.repository');

const invalid = (message, status = 400) => Object.assign(new Error(message), { status });
const KINDS = new Set(['FACILITY', 'RETURN', 'LOSS']);
// The same image limit as the requester profile picture.
const MAX_RECEIPT_CHARS = 1_400_000;
const RECEIPT_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

function validateCharge(kindValue, refValue) {
  const kind = String(kindValue || '');
  if (!KINDS.has(kind)) throw invalid('Hindi valid ang uri ng charge.', 404);
  const ref = String(refValue || '');
  if (!/^\d{1,18}$/.test(ref)) throw invalid('Hindi valid ang charge.', 404);
  return { kind, ref };
}

async function listCharges() {
  const rows = await repository.listCharges();
  return rows.map((row) => ({ ...row, status: row.paid ? 'Paid' : 'To pay' }));
}

async function getReceipt(kindValue, refValue) {
  const { kind, ref } = validateCharge(kindValue, refValue);
  const receipt = await repository.getReceipt(kind, ref);
  if (!receipt) throw invalid('Walang resibo para sa charge na ito.', 404);
  return receipt;
}

async function payCharge(kindValue, refValue, input, user) {
  const { kind, ref } = validateCharge(kindValue, refValue);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Mag-upload ng resibo bago i-mark as Paid.');
  const receiptData = typeof input.receiptData === 'string' ? input.receiptData : '';
  if (!receiptData || receiptData.length > MAX_RECEIPT_CHARS || !RECEIPT_PATTERN.test(receiptData)) {
    invalid('Mag-upload ng resibo na JPG, PNG, o WebP, 1 MB o mas maliit.');
  }
  const receiptName = typeof input.receiptName === 'string' ? input.receiptName.trim().slice(0, 200) : '';
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';

  const charge = await repository.payCharge({ kind, ref, receiptData, receiptName, note, userId: user.id });

  // The uploader is recorded in the audit log, so a fake receipt traces back to the staff member who uploaded it.
  await auditRepository.writeLog(null, {
    entityType: 'request',
    entityKey: String(charge.referenceNo || ref),
    entityName: charge.itemName || String(charge.referenceNo || ref),
    action: 'updated',
    reason: `Payment of ${Number(charge.amount || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })} for ${charge.itemName || 'the item'} (${charge.personName || 'requester'}) marked Paid. Receipt uploaded by ${user.name || 'GSO Staff'}${receiptName ? ` (${receiptName})` : ''}.`,
    newValues: { chargeKind: kind, paid: true, receiptName },
    changedByUserId: user.id,
  });
  return { kind, ref, status: 'Paid' };
}

module.exports = { listCharges, getReceipt, payCharge };
