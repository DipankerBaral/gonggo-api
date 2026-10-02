// Shared setup for browser tests.
const base = require('@playwright/test');
const { newUser, createGame, validGame } = require('../helpers');

const test = base.test.extend({
  page: async ({ page }, use) => {
    // Don't fetch real map tiles from OpenStreetMap during tests: it's slow,
    // it's someone else's server, and the tests don't need street detail.
    await page.route(/tile\.openstreetmap\.org/, (route) => route.abort());

    // Fail the test on any JavaScript error in the page
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await use(page);
    base.expect(errors, 'JavaScript errors in the page').toEqual([]);
  },
});

// Pretend this browser has already told GongGo its name
async function signInAs(page, name) {
  const user = { id: `${name.toLowerCase()}-${Math.random().toString(16).slice(2, 6).padEnd(4, '0')}`, name };
  await page.addInitScript((u) => localStorage.setItem('gonggo:user', JSON.stringify(u)), user);
  return user;
}

// A title nobody else's test will use, so each test can find its own game
const uniqueTitle = (label) => `${label} ${Math.random().toString(36).slice(2, 7)}`;

module.exports = { test, expect: base.expect, signInAs, uniqueTitle, newUser, createGame, validGame };
