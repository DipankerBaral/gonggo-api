// All configuration comes from environment variables.
// Docker, GitHub Actions and AWS will set these; locally we fall back to defaults.
const config = {
  port: Number(process.env.PORT) || 3000,
  adminKey: process.env.ADMIN_KEY || 'dev-admin-key',
  seed: process.env.SEED !== 'false',
  // Default points at the Postgres container from docker-compose, as seen from
  // your own machine (port 5433). Inside Docker, compose overrides this to use
  // the service name "db" instead of localhost.
  databaseUrl: process.env.DATABASE_URL || 'postgres://gonggo:gonggo@localhost:5433/gonggo',

  // Sign-in. With Cognito settings present, the API only accepts tokens signed
  // by Cognito. Without them it runs in "dev" mode (see src/auth/index.js).
  auth: {
    region: process.env.AWS_REGION || 'ap-southeast-2',
    userPoolId: process.env.COGNITO_USER_POOL_ID || '',
    clientId: process.env.COGNITO_CLIENT_ID || '',
    domain: process.env.COGNITO_DOMAIN || '', // e.g. gonggo-123456789012.auth.ap-southeast-2.amazoncognito.com
    providers: (process.env.AUTH_PROVIDERS || '').split(',').map((p) => p.trim()).filter(Boolean), // "google,apple"
    allowDevAuth: process.env.ALLOW_DEV_AUTH === 'true',
  },
};

config.auth.mode = config.auth.userPoolId && config.auth.clientId ? 'cognito' : 'dev';

if (!process.env.ADMIN_KEY) {
  console.warn('WARNING: ADMIN_KEY not set, using the default dev key. Never do this in production.');
}

module.exports = config;
