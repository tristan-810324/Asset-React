const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  // On Vercel, close idle connections quickly and give a suspended Neon compute time to wake up.
  idleTimeoutMillis: env.isVercel ? 5000 : 30000,
  connectionTimeoutMillis: env.isVercel ? 10000 : 5000,
});

pool.on('error', () => {
  console.error('Unexpected PostgreSQL connection error.');
});

if (env.isVercel) {
  // Lets idle connections close cleanly before Vercel suspends the function.
  require('@vercel/functions/db-connections').attachDatabasePool(pool);
}

module.exports = pool;
