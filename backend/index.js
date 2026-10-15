const env = require('./src/config/env');
const pool = require('./src/config/db');
const app = require('./src/app');
const issuancesService = require('./src/modules/issuances/issuances.service');

async function startServer() {
  await pool.query('SELECT 1');
  void issuancesService.expirePendingIssuances().catch(() => {
    console.error('Could not run the initial expired issuance cleanup.');
  });
  const issuanceExpirySweep = setInterval(() => {
    void issuancesService.expirePendingIssuances().catch(() => {
      console.error('Could not run the expired issuance cleanup.');
    });
  }, 60 * 1000);
  issuanceExpirySweep.unref();
  app.listen(env.port, () => {
    console.log(`Server is running on port ${env.port}`);
  });
}

startServer().catch((error) => {
  console.error('Backend startup failed. Check the database connection and backend/.env configuration.');
  process.exitCode = 1;
});
