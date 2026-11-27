const nodemailer = require('nodemailer');
const env = require('../../config/env');
const pool = require('../../config/db');
const notificationsRepository = require('./notifications.repository');
const { emailLayout } = require('../../lib/email-layout');

// The same mail setup as the return confirmation emails.
const mailTransport = env.smtp
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  : null;

// The requester account: the given user, else the verified profile for the employee code, else the account with the employee's email.
async function accountUserId({ userId, employeeCode, employeeEmail }) {
  if (userId) return userId;
  if (employeeCode) {
    const byCode = await notificationsRepository.userIdForEmployeeCode(employeeCode);
    if (byCode) return byCode;
  }
  if (employeeEmail) {
    const byEmail = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1', [employeeEmail]);
    return byEmail.rows[0]?.id || null;
  }
  return null;
}

// Tells the requester in the app and by email. A failure is only logged, so it never blocks the GSO action.
async function notifyRequester({ userId, employeeCode, employeeEmail, title, message, href, dedupeKey }) {
  try {
    const recipient = await accountUserId({ userId, employeeCode, employeeEmail });
    if (!recipient) return;
    await notificationsRepository.createUserNotification({ userId: recipient, type: 'RETURN', title, message, href, dedupeKey });
    const account = await pool.query('SELECT name, email FROM users WHERE id = $1', [recipient]);
    const { name, email } = account.rows[0] || {};
    if (!mailTransport || !email) return;
    await mailTransport.sendMail({
      from: env.smtp.from,
      to: email,
      subject: title,
      text: [`Dear ${name || 'requester'},`, '', message, '', 'Sign in to A.SSET to see the details.'].join('\n'),
      html: emailLayout({
        title,
        intro: `Dear ${name || 'requester'}, ${message}`,
        body: '<p style="margin:0;font-size:13px;color:#64748b;">Sign in to A.SSET to see the details.</p>',
      }),
    });
  } catch (error) {
    console.error('Requester notice failed:', error.message);
  }
}

module.exports = { notifyRequester };
