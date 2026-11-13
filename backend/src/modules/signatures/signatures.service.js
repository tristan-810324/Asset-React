const crypto = require('node:crypto');
const { decodePng } = require('../../lib/png');
const signaturesRepository = require('./signatures.repository');
const auditRepository = require('../audit/audit.repository');

const MAX_BYTES = 300 * 1024;
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 800;
const PNG_SIGNATURE = '89504e470d0a1a0a';

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};

// Accepts a PNG (as base64 or a data URL) that the PDF writer can read, and returns its bytes.
function readSignatureImage(value) {
  if (typeof value !== 'string' || !value.trim()) fail('Choose a PNG image of your signature.');
  const base64 = value.trim().replace(/^data:image\/png;base64,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) fail('Upload a PNG image.');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_BYTES) fail('The signature image is larger than 300 KB. Save a smaller PNG.');
  if (bytes.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) fail('Upload a PNG image.');
  let decoded;
  try {
    decoded = decodePng(bytes);
  } catch (error) {
    fail('Save the signature as a 24-bit or 32-bit PNG.');
  }
  if (decoded.width > MAX_WIDTH || decoded.height > MAX_HEIGHT) fail('The signature image is too large. Keep it under 1600 x 800 pixels.');
  return { bytes, width: decoded.width, height: decoded.height };
}

function toPreview(row) {
  return {
    width: row.width,
    height: row.height,
    updatedAt: row.updatedAt,
    imageDataUrl: `data:image/png;base64,${row.image.toString('base64')}`,
  };
}

async function getMySignature(user) {
  const row = await signaturesRepository.getSignature(user.id);
  return row ? toPreview(row) : null;
}

async function saveMySignature(user, imageBase64) {
  const image = readSignatureImage(imageBase64);
  const imageSha256 = crypto.createHash('sha256').update(image.bytes).digest('hex');
  // Saved and audited in one transaction, so a signature change is never unrecorded.
  const saved = await signaturesRepository.inTransaction(async (client) => {
    const previous = await signaturesRepository.getSignature(user.id, client);
    const row = await signaturesRepository.saveSignature({
      userId: user.id,
      image: image.bytes,
      width: image.width,
      height: image.height,
      imageSha256,
    }, client);
    await auditRepository.writeLog(client, {
      entityType: 'signature',
      entityKey: user.email,
      entityName: `E-signature of ${user.name || user.email}`,
      action: previous ? 'updated' : 'created',
      reason: previous
        ? 'The GSO Head replaced the e-signature. New PDFs use the new image.'
        : 'The GSO Head uploaded an e-signature for requisition PDFs.',
      oldValues: previous ? { signatureFingerprint: previous.imageSha256 } : {},
      newValues: { signatureFingerprint: row.imageSha256, width: row.width, height: row.height },
      changedByUserId: user.id,
    });
    return row;
  });
  return { width: saved.width, height: saved.height, updatedAt: saved.updatedAt, imageDataUrl: toPreview({ ...saved, image: image.bytes }).imageDataUrl };
}

// The PNG and its hash for the requisition PDF; null when the GSO Head has not uploaded a signature.
async function getSignatureForDocument(userId) {
  const row = await signaturesRepository.getSignature(userId);
  if (!row) return null;
  return { png: row.image, sha256: row.imageSha256 };
}

module.exports = { readSignatureImage, getMySignature, saveMySignature, getSignatureForDocument };
