const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

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

module.exports = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port,
  databaseUrl,
  jwtSecret,
  frontendOrigin: process.env.FRONTEND_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5173',
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
