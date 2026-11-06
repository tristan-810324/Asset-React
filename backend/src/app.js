const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const pool = require('./config/db');
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const inventoryCountsRoutes = require('./modules/inventory/counts.routes');
const employeesRoutes = require('./modules/employees/employees.routes');
const issuancesRoutes = require('./modules/issuances/issuances.routes');
const departmentsRoutes = require('./modules/departments/departments.routes');
const auditRoutes = require('./modules/audit/audit.routes');
const requestsRoutes = require('./modules/requests/requests.routes');
const requesterIdentityRoutes = require('./modules/requester-identity/requester-identity.routes');
const errorMiddleware = require('./middleware/error.middleware');
const expirySweepMiddleware = require('./middleware/expiry-sweep.middleware');

const app = express();

if (env.isVercel) {
  // Vercel overwrites X-Forwarded-For with the client address, and the login and OTP
  // rate limits need that address. Elsewhere this header could be spoofed, so it stays off.
  app.set('trust proxy', true);
}

const allowedFrontendOrigins = new Set(Array.isArray(env.frontendOrigin) ? env.frontendOrigin : [env.frontendOrigin]);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedFrontendOrigins.has(origin)) return callback(null, true);
    console.warn('Blocked a browser request from an unconfigured frontend origin.', { origin });
    return callback(null, false);
  },
}));
app.use(express.json({ limit: '2mb' }));

app.get('/', (req, res) => {
  res.send('PERN Backend Server is running!');
});

app.get('/api/v1/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, data: { status: 'ok', database: 'connected' } });
  } catch (error) {
    next(error);
  }
});

if (env.isVercel) {
  // Vercel imports this file directly, so index.js and its setInterval never run there.
  app.use(expirySweepMiddleware);
}

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/inventory-counts', inventoryCountsRoutes);
app.use('/api/v1/employees', employeesRoutes);
app.use('/api/v1/issuances', issuancesRoutes);
app.use('/api/v1/departments', departmentsRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/requests', requestsRoutes);
app.use('/api/v1/requester-identity', requesterIdentityRoutes);
app.use(errorMiddleware);

module.exports = app;
