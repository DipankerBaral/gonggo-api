const express = require('express');
const { pool } = require('./db/pool');
const gamesRouter = require('./routes/games');
const adminRouter = require('./routes/admin');

const app = express();
app.use(express.json({ limit: '10kb' }));

// Used by Docker, the AWS load balancer and ECS to check the app is alive.
// It also checks the database, so "healthy" means the app can actually work.
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'ok', uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
});

app.use('/games', gamesRouter);
app.use('/admin', adminRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
