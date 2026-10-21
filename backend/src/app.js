const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const pool = require('./config/db');
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const employeesRoutes = require('./modules/employees/employees.routes');
const issuancesRoutes = require('./modules/issuances/issuances.routes');
const departmentsRoutes = require('./modules/departments/departments.routes');
const auditRoutes = require('./modules/audit/audit.routes');
const errorMiddleware = require('./middleware/error.middleware');

const app = express();

app.use(cors({ origin: env.frontendOrigin }));
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

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/employees', employeesRoutes);
app.use('/api/v1/issuances', issuancesRoutes);
app.use('/api/v1/departments', departmentsRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use(errorMiddleware);

module.exports = app;
