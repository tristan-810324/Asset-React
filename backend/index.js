const env = require('./src/config/env');
const pool = require('./src/config/db');
const app = require('./src/app');

async function startServer() {
  await pool.query('SELECT 1');
  app.listen(env.port, () => {
    console.log(`Server is running on port ${env.port}`);
  });
}

startServer().catch((error) => {
  console.error('Backend startup failed. Check the database connection and backend/.env configuration.');
  process.exitCode = 1;
});
