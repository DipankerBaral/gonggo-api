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

// Start the test already signed in (dev sign-in mode, as on a laptop)
async function signInAs(page, name, { admin = false } = {}) {
  const user = {
    id: `${name.toLowerCase()}-${Math.random().toString(16).slice(2, 6).padEnd(4, '0')}`,
    name,
    devConsent: true, // already confirmed 18+ and accepted the terms (tests/ui/consent.spec.js covers that flow)
    ...(admin ? { groups: ['admins'] } : {}), // dev sign-in pretends to be in the Cognito admins group
  };
  await page.addInitScript((u) => localStorage.setItem('gonggo:session', JSON.stringify(u)), user);
  return user;
}

// The welcome step after a first sign-in: date of birth and the terms
async function completeWelcome(page, { dateOfBirth = '1995-06-15' } = {}) {
  const dialog = page.getByRole('dialog', { name: 'Welcome to GongGo' });
  await dialog.getByLabel('Date of birth').fill(dateOfBirth);
  await dialog.getByRole('checkbox', { name: /I agree to the Terms of Use/ }).check();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  return dialog;
}

// A title nobody else's test will use, so each test can find its own game
const uniqueTitle = (label) => `${label} ${Math.random().toString(36).slice(2, 7)}`;

module.exports = { test, expect: base.expect, signInAs, completeWelcome, uniqueTitle, newUser, createGame, validGame };
