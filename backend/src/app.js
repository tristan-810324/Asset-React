const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const pool = require('./config/db');
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const errorMiddleware = require('./middleware/error.middleware');

const app = express();

app.use(cors({ origin: env.frontendOrigin }));
app.use(express.json());

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
app.use(errorMiddleware);

module.exports = app;
