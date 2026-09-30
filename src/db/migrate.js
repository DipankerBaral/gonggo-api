// A tiny migration runner. It applies each .sql file in migrations/ once,
// in filename order, and records what it has run in schema_migrations.
// Run automatically on startup, or by hand with: npm run migrate
const fs = require('fs');
const path = require('path');
const { pool, withTransaction } = require('./pool');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// The database container can take a few seconds to accept connections,
// so keep trying for a while instead of crashing straight away.
async function waitForDatabase(attempts = 20, delayMs = 1500) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`Waiting for database (attempt ${i}/${attempts}): ${err.message}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function migrate() {
  await waitForDatabase();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    await withTransaction(async (client) => {
      // Lock so two app containers starting at once don't both run migrations
      await client.query('SELECT pg_advisory_xact_lock(4242)');
      const { rowCount } = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
      if (rowCount) return;
      console.log(`Applying migration ${file}`);
      await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
  }
}

module.exports = { migrate };

if (require.main === module) {
  migrate()
    .then(() => { console.log('Migrations up to date'); return pool.end(); })
    .catch((err) => { console.error(err); process.exit(1); });
}
