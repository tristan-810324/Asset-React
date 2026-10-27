const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const env = require('../../config/env');
const authRepository = require('./auth.repository');
const { normalizeEmail, validatePassword, validateChallengeId } = require('./auth.validation');

const invalidLoginMessage = 'Email or password is incorrect.';
const resetMessage = 'If an active account matches that email, a verification code has been sent.';
const invalidCodeMessage = 'The verification code is invalid or expired.';
const emailVerificationMessage = 'A one-time verification code has been sent to your email.';
const mailTransport = env.smtp
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    })
  : null;

const dummyPasswordHash = bcrypt.hash('not-a-real-account-password', 10);

function httpError(status, message) {
  return Object.assign(new Error(message), { status, expose: status === 503 });
}

function verifier(value) {
  return crypto.createHmac('sha256', env.jwtSecret).update(value).digest('hex');
}

async function enforceRateLimit(kind, identity, maxRequests, windowMinutes) {
  if (!identity) return;
  const bucketKey = verifier(`${kind}:${identity}`);
  const count = await authRepository.incrementAuthRateLimit(bucketKey, windowMinutes);
  if (count > maxRequests) {
    throw httpError(429, 'Too many requests. Try again later.');
  }
}

function publicUser(user, roles) {
  return { id: user.id, name: user.name, email: user.email, roles };
}

async function registerBorrower({ name, email, password, ipAddress }) {
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  if (!normalizedName || normalizedName.length > 120) {
    throw httpError(400, 'Enter your name (up to 120 characters).');
  }
  const normalizedEmail = normalizeEmail(email);
  validatePassword(password, { newPassword: true });
  if (!mailTransport) {
    throw httpError(503, 'Email verification is unavailable. Configure SMTP or contact the IT Admin.');
  }

  await enforceRateLimit('borrower_registration_ip', ipAddress, 10, 15);
  await enforceRateLimit('borrower_registration_email', normalizedEmail, 5, 60);
  const passwordHash = await bcrypt.hash(password, 12);

  let user;
  try {
    user = await authRepository.createBorrowerUser({
      name: normalizedName,
      email: normalizedEmail,
      passwordHash,
    });
  } catch (error) {
    if (error.code === '23505') {
      throw httpError(409, 'An account with this email already exists. Please sign in.');
    }
    if (error.code === 'BORROWER_ROLE_MISSING') {
      throw httpError(503, 'Borrower registration is not ready. Apply the database seed and try again.');
    }
    throw error;
  }

  return requestEmailVerificationOtp(user);
}

async function createLoginSession(user, roles, ipAddress) {
  await authRepository.recordLoginEvent({
    userId: user.id,
    email: user.email,
    ipAddress,
    eventType: 'login_succeeded',
  });

  const token = jwt.sign(
    { ver: user.token_version, roles },
    env.jwtSecret,
    { subject: String(user.id), expiresIn: '1h', issuer: 'dyci-gso' },
  );

  return { token, user: publicUser(user, roles) };
}

async function requestEmailVerificationOtp(user) {
  if (!mailTransport) {
    throw httpError(503, 'Email verification is unavailable. Configure SMTP or contact the IT Admin.');
  }

  const activeChallengeId = await authRepository.getActiveEmailVerificationOtp(user.id);
  if (activeChallengeId) {
    return { requiresEmailVerification: true, challengeId: activeChallengeId, email: user.email };
  }

  await enforceRateLimit('email_verification_otp', user.email, 5, 60);
  const challengeId = crypto.randomUUID();
  const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const otpHash = verifier(`${challengeId}:${otp}`);
  const created = await authRepository.createEmailVerificationOtp({
    userId: user.id,
    challengeId,
    tokenHash: otpHash,
  });

  if (created.unavailable) throw httpError(401, invalidLoginMessage);
  if (created.alreadyVerified) return { alreadyVerified: true };
  if (!created.created) {
    return { requiresEmailVerification: true, challengeId: created.challengeId, email: user.email };
  }

  try {
    await mailTransport.sendMail({
      from: env.smtp.from,
      to: user.email,
      subject: 'A.SSET account verification code',
      text: `Your A.SSET email verification code is ${otp}. It expires in 5 minutes and can only be used once. If you did not try to sign in, ignore this email.`,
    });
  } catch (error) {
    await authRepository.invalidateToken(challengeId);
    console.error('Account verification email could not be delivered.', {
      code: error.code,
      responseCode: error.responseCode,
      command: error.command,
    });
    throw httpError(503, 'Could not send the verification code. Check the Gmail SMTP App Password in backend/.env and try again.');
  }

  return {
    requiresEmailVerification: true,
    challengeId,
    email: user.email,
    message: emailVerificationMessage,
  };
}

async function resendEmailVerificationOtp({ challengeId, ipAddress }) {
  validateChallengeId(challengeId);
  if (!mailTransport) {
    throw httpError(503, 'Email verification is unavailable. Configure SMTP or contact the IT Admin.');
  }

  await enforceRateLimit('email_verification_resend_ip', ipAddress, 10, 15);
  const user = await authRepository.getEmailVerificationUserByChallenge(challengeId);
  if (!user || !user.is_active || user.email_verified_at) {
    throw httpError(400, 'This verification request is invalid or has expired. Sign in again to request a new code.');
  }

  await enforceRateLimit('email_verification_otp', user.email, 5, 60);
  const nextChallengeId = crypto.randomUUID();
  const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const otpHash = verifier(`${nextChallengeId}:${otp}`);
  const created = await authRepository.replaceEmailVerificationOtp({
    userId: user.id,
    challengeId: nextChallengeId,
    tokenHash: otpHash,
  });

  if (created.unavailable) throw httpError(401, invalidLoginMessage);
  if (created.alreadyVerified) return { alreadyVerified: true };
  if (!created.created) throw httpError(400, 'This verification request is invalid or has expired. Sign in again to request a new code.');

  try {
    await mailTransport.sendMail({
      from: env.smtp.from,
      to: user.email,
      subject: 'A.SSET account verification code',
      text: `Your new A.SSET email verification code is ${otp}. It expires in 5 minutes and can only be used once. If you did not request this, ignore this email.`,
    });
  } catch (error) {
    await authRepository.invalidateToken(nextChallengeId);
    console.error('Account verification email could not be delivered.', {
      code: error.code,
      responseCode: error.responseCode,
      command: error.command,
    });
    throw httpError(503, 'Could not send the verification code. Check the Gmail SMTP App Password in backend/.env and try again.');
  }

  return {
    requiresEmailVerification: true,
    challengeId: nextChallengeId,
    email: user.email,
    message: 'A new one-time verification code has been sent to your email.',
  };
}

async function login({ email, password, ipAddress }) {
  const normalizedEmail = normalizeEmail(email);
  validatePassword(password);
  await enforceRateLimit('login_ip', ipAddress, 60, 15);

  const failures = await authRepository.countRecentLoginFailures(normalizedEmail, ipAddress);
  if (failures.emailFailures >= 10 || failures.ipFailures >= 30) {
    throw httpError(429, 'Too many sign-in attempts. Try again later.');
  }

  const user = await authRepository.getUserByEmail(normalizedEmail);
  const hash = user?.password_hash || await dummyPasswordHash;
  const passwordMatches = await bcrypt.compare(password, hash);

  if (!user || !user.is_active || !passwordMatches) {
    await authRepository.recordLoginEvent({
      email: normalizedEmail,
      ipAddress,
      eventType: 'login_failed',
    });
    throw httpError(401, invalidLoginMessage);
  }

  const roles = await authRepository.getUserRoles(user.id);
  if (roles.length === 0) {
    await authRepository.recordLoginEvent({
      userId: user.id,
      email: normalizedEmail,
      ipAddress,
      eventType: 'login_failed',
    });
    throw httpError(401, invalidLoginMessage);
  }

  if (!user.email_verified_at) {
    const verification = await requestEmailVerificationOtp(user);
    if (!verification.alreadyVerified) return verification;
  }

  return createLoginSession(user, roles, ipAddress);
}

async function verifyEmailOtp({ challengeId, otp, ipAddress }) {
  validateChallengeId(challengeId);
  await enforceRateLimit('verify_email_otp_ip', ipAddress, 20, 15);
  if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
    throw httpError(400, invalidCodeMessage);
  }

  const user = await authRepository.consumeEmailVerificationOtp({
    challengeId,
    otpHash: verifier(`${challengeId}:${otp}`),
  });
  if (!user) throw httpError(400, invalidCodeMessage);

  const roles = await authRepository.getUserRoles(user.id);
  if (roles.length === 0) throw httpError(401, invalidLoginMessage);
  return createLoginSession(user, roles, ipAddress);
}

async function requestPasswordReset({ email, ipAddress }) {
  if (!mailTransport) {
    throw httpError(503, 'Password reset is temporarily unavailable. Configure SMTP in backend/.env.');
  }

  const normalizedEmail = normalizeEmail(email);
  await enforceRateLimit('forgot_ip', ipAddress, 5, 15);
  await enforceRateLimit('forgot_email', normalizedEmail, 5, 60);
  const user = await authRepository.getPasswordResetUser(normalizedEmail);
  const challengeId = crypto.randomUUID();
  if (!user || !user.is_active) {
    return { message: resetMessage, challengeId };
  }

  const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const otpHash = verifier(`${challengeId}:${otp}`);
  const created = await authRepository.createPasswordResetOtp({
    userId: user.id,
    challengeId,
    tokenHash: otpHash,
  });

  if (!created) {
    return { message: resetMessage, challengeId };
  }

  try {
    await mailTransport.sendMail({
      from: env.smtp.from,
      to: user.email,
      subject: 'A.SSET password reset code',
      text: `Your A.SSET password reset code is ${otp}. It expires in 5 minutes and can only be used once. If you did not request this, ignore this email.`,
    });
  } catch (error) {
    await authRepository.invalidateToken(challengeId);
    console.error('Password reset email could not be delivered. Check SMTP configuration.');
  }

  return { message: resetMessage, challengeId };
}

async function verifyPasswordResetOtp({ challengeId, otp, ipAddress }) {
  validateChallengeId(challengeId);
  await enforceRateLimit('verify_otp_ip', ipAddress, 20, 15);
  if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
    throw httpError(400, invalidCodeMessage);
  }

  const resetToken = crypto.randomBytes(32).toString('base64url');
  const valid = await authRepository.consumeOtpAndCreateResetToken({
    challengeId,
    otpHash: verifier(`${challengeId}:${otp}`),
    resetTokenHash: verifier(resetToken),
  });

  if (!valid) {
    throw httpError(400, invalidCodeMessage);
  }
  return { resetToken };
}

async function resetPassword({ resetToken, password, ipAddress }) {
  if (typeof resetToken !== 'string' || resetToken.length < 32 || resetToken.length > 256) {
    throw httpError(400, 'The password reset request is invalid or expired.');
  }
  validatePassword(password, { newPassword: true });
  await enforceRateLimit('reset_password_ip', ipAddress, 20, 15);

  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await authRepository.updatePasswordWithResetToken({
    tokenHash: verifier(resetToken),
    passwordHash,
  });
  if (!updated) {
    throw httpError(400, 'The password reset request is invalid or expired.');
  }
  return { message: 'Password updated. You can now sign in.' };
}

module.exports = { registerBorrower, login, verifyEmailOtp, resendEmailVerificationOtp, requestPasswordReset, verifyPasswordResetOtp, resetPassword };
