const { waitUntil } = require('@vercel/functions');
const issuancesService = require('../modules/issuances/issuances.service');
const returnsService = require('../modules/issuances/returns.service');

const sweepIntervalMs = 60 * 1000;
let lastSweepAt = 0;

// Serverless stand-in for the setInterval in index.js: a function only runs while it handles
// a request, so the cleanup runs before a request, at most once a minute per instance.
// Instances may overlap safely because the cleanup queries use FOR UPDATE SKIP LOCKED.
module.exports = async function expirySweepMiddleware(req, res, next) {
  const now = Date.now();
  if (now - lastSweepAt >= sweepIntervalMs) {
    lastSweepAt = now;
    // Reminder emails can be slow, so they finish after the response instead of delaying it.
    waitUntil(returnsService.sendOverdueReminders().catch(() => {
      console.error('Could not send the overdue borrowing reminders.');
    }));
    await Promise.all([
      issuancesService.expirePendingIssuances().catch(() => {
        console.error('Could not run the expired issuance cleanup.');
      }),
      returnsService.expirePendingReturns().catch(() => {
        console.error('Could not run the expired return cleanup.');
      }),
    ]);
  }
  next();
};
