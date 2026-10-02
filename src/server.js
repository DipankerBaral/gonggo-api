const config = require('./config');
const app = require('./app');
const { pool } = require('./db/pool');
const { migrate } = require('./db/migrate');
const { checkStartupSafety } = require('./auth');

async function main() {
  checkStartupSafety(); // never run with fake sign-in on a real server
  await migrate(); // bring the database schema up to date before serving traffic
  if (config.seed) await require('./seed')();

  const server = app.listen(config.port, () => {
    console.log(`GongGo API listening on port ${config.port}`);
  });
  // Keep idle connections open longer than the AWS load balancer does (60s).
  // Node's default (5s) means the app can close a connection at the same
  // moment the load balancer (or a test) reuses it: random ECONNRESET / 502s.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000; // must be a little longer than keepAliveTimeout

  // Graceful shutdown. "docker stop" (and ECS during deploys) sends SIGTERM:
  // finish in-flight requests, close database connections, then exit.
  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref(); // don't hang forever
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
