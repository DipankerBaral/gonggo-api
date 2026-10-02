const { randomUUID } = require('crypto');

const ADMIN_KEY = process.env.ADMIN_KEY || 'dev-admin-key';

// Every test uses brand-new user ids, so tests never clash with each other,
// even when running in parallel or against a shared environment.
const newUser = (label = 'user') => `${label}-${randomUUID().slice(0, 8)}`;

// Dev sign-in: who the request is from (and, optionally, their first name)
const asUser = (userId, name) => ({ 'x-user-id': userId, ...(name ? { 'x-user-name': name } : {}) });
const asAdmin = () => ({ 'x-admin-key': ADMIN_KEY });

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

module.exports = { newUser, asUser, asAdmin, daysFromNow, validGame, createGame };
