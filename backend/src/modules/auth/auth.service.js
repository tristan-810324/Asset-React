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
  return Object.assign(new Error(message), { status });
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

  await authRepository.recordLoginEvent({
    userId: user.id,
    email: normalizedEmail,
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

module.exports = { login, requestPasswordReset, verifyPasswordResetOtp, resetPassword };
