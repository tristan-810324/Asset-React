// backend/.env is loaded by the local entry points, index.js and scripts/create-admin.js.
// Keep it out of this file: Vercel's build copies any file referenced here into the function.

// Vercel sets VERCEL=1 at build time and at runtime.
const isVercel = Boolean(process.env.VERCEL);

// Vercel runs in UTC and reserves the TZ variable, so it cannot be set in its dashboard.
// The date logic in this app expects Philippine time, the same as a local server here.
if (isVercel) {
  process.env.TZ = 'Asia/Manila';
}

function requiredValue(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const port = Number(requiredValue('PORT', '5000'));
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const databaseUrl = requiredValue('DATABASE_URL');
if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  throw new Error('DATABASE_URL must use the postgres:// or postgresql:// format.');
}

const jwtSecret = requiredValue('JWT_SECRET');
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters.');
}

const smtpNames = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
const smtpValues = Object.fromEntries(smtpNames.map((name) => [name, process.env[name]?.trim()]));
const configuredSmtpCount = Object.values(smtpValues).filter(Boolean).length;
if (configuredSmtpCount > 0 && configuredSmtpCount < smtpNames.length) {
  throw new Error('Configure all SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS values, or leave all four empty.');
}

const smtpPort = smtpValues.SMTP_PORT ? Number(smtpValues.SMTP_PORT) : null;
if (smtpPort !== null && (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)) {
  throw new Error('SMTP_PORT must be an integer between 1 and 65535.');
}

const isGmailSmtp = /(^|\.)gmail\.com$/i.test(smtpValues.SMTP_HOST || '');
const smtpPassword = isGmailSmtp ? smtpValues.SMTP_PASS?.replace(/\s+/g, '') : smtpValues.SMTP_PASS;

// One origin, or several separated by commas. A browser Origin header never ends in a slash.
// Never silently use localhost as the production origin: the current production frontend is
// hosted at asset-react-cane.vercel.app. Additional previews/custom domains remain configurable.
const defaultFrontendOrigins = isVercel
  ? ['https://asset-react-cane.vercel.app']
  : ['http://localhost:5173'];
const frontendOrigins = [...new Set([
  ...defaultFrontendOrigins,
  ...(process.env.FRONTEND_ORIGIN || process.env.FRONTEND_URL || '').split(','),
])]
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter((origin) => origin && (!isVercel || /^https:\/\//i.test(origin)));

module.exports = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  isVercel,
  port,
  databaseUrl,
  jwtSecret,
  frontendOrigin: frontendOrigins.length === 1 ? frontendOrigins[0] : frontendOrigins,
  smtp: configuredSmtpCount === smtpNames.length
    ? {
        host: smtpValues.SMTP_HOST,
        port: smtpPort,
        user: smtpValues.SMTP_USER,
        pass: smtpPassword,
        from: process.env.SMTP_FROM?.trim() || smtpValues.SMTP_USER,
      }
    : null,
});
