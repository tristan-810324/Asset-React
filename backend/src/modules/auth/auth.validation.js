const { TextEncoder } = require('node:util');

const encoder = new TextEncoder();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  if (typeof email !== 'string') {
    throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
  }
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !emailPattern.test(normalized)) {
    throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
  }
  return normalized;
}

function validatePassword(password, { newPassword = false } = {}) {
  if (typeof password !== 'string' || password.length === 0) {
    throw Object.assign(new Error('Password is required.'), { status: 400 });
  }
  const byteLength = encoder.encode(password).length;
  if (byteLength > 72 || (newPassword && byteLength < 8)) {
    throw Object.assign(new Error(newPassword
      ? 'Password must contain 8 to 72 UTF-8 bytes.'
      : 'Password is too long.'), { status: 400 });
  }
}

function validateChallengeId(challengeId) {
  if (typeof challengeId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(challengeId)) {
    throw Object.assign(new Error('The verification request is invalid or expired.'), { status: 400 });
  }
}

module.exports = { normalizeEmail, validatePassword, validateChallengeId };
