// One shared pool of database connections for the whole app.
// Opening a new connection per request is slow; a pool reuses a handful.
const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });

pool.on('error', (err) => console.error('Unexpected database error', err));

// Runs fn inside a transaction: everything commits together or nothing does.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction };
