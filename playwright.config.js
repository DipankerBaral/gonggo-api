// @ts-check
const { defineConfig } = require('@playwright/test');

// Where are we testing?
//  - No BASE_URL: Playwright starts the API itself on port 3001 (local runs, CI)
//  - BASE_URL set: test an already running API (a Docker container, AWS later)
const PORT = process.env.TEST_PORT || 3001;
const baseURL = process.env.BASE_URL || `http://localhost:${PORT}`;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI, // fail CI if someone leaves test.only in
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'node src/server.js',
        url: `${baseURL}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
        env: {
          PORT: String(PORT),
          SEED: 'false', // start empty so tests control all the data
          ADMIN_KEY: process.env.ADMIN_KEY || 'dev-admin-key',
        },
      },
});
