// All configuration comes from environment variables.
// Docker, GitHub Actions and AWS will set these; locally we fall back to defaults.
const config = {
  port: Number(process.env.PORT) || 3000,
  adminKey: process.env.ADMIN_KEY || 'dev-admin-key',
  seed: process.env.SEED !== 'false',
};

if (!process.env.ADMIN_KEY) {
  console.warn('WARNING: ADMIN_KEY not set, using the default dev key. Never do this in production.');
}

module.exports = config;
