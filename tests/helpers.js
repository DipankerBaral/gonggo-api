const { randomUUID } = require('crypto');

const ADMIN_KEY = process.env.ADMIN_KEY || 'dev-admin-key';

// Every test uses brand-new user ids, so tests never clash with each other,
// even when running in parallel or against a shared environment.
const newUser = (label = 'user') => `${label}-${randomUUID().slice(0, 8)}`;

// Dev sign-in: who the request is from (and, optionally, their first name).
// x-dev-consent makes them someone who has already confirmed they're 18+ and
// accepted the terms; tests about consent itself use asNewUser instead.
const asUser = (userId, name) => ({ 'x-user-id': userId, 'x-dev-consent': 'yes', ...(name ? { 'x-user-name': name } : {}) });
const asNewUser = (userId) => ({ 'x-user-id': userId });
const asAdmin = () => ({ 'x-admin-key': ADMIN_KEY });
// Dev sign-in as a member of the Cognito "admins" group
const asAdminUser = (userId) => ({ 'x-user-id': userId, 'x-user-groups': 'admins', 'x-dev-consent': 'yes' });

function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function validGame(overrides = {}) {
  return {
    title: 'Test futsal',
    sport: 'soccer',
    capacity: 10,
    startsAt: daysFromNow(2),
    location: { name: 'Stuart Park', lat: -34.4128, lng: 150.8975 },
    ...overrides,
  };
}

// Creates a game and fails loudly if that didn't work
async function createGame(request, hostId, overrides = {}) {
  const res = await request.post('/games', { headers: asUser(hostId), data: validGame(overrides) });
  if (res.status() !== 201) throw new Error(`createGame failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

// The whole public list, following every page (tests share a busy database,
// so a test's own game might be on page 5)
async function listAll(request, query = '') {
  const games = [];
  let cursor = null;
  do {
    const params = new URLSearchParams(query);
    params.set('limit', '100');
    if (cursor) params.set('cursor', cursor);
    const page = await (await request.get(`/games?${params}`)).json();
    games.push(...page.games);
    cursor = page.nextCursor;
  } while (cursor);
  return games;
}

module.exports = { listAll, newUser, asUser, asNewUser, asAdmin, asAdminUser, daysFromNow, validGame, createGame };
