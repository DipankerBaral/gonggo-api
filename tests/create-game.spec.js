const { test, expect } = require('@playwright/test');
const { newUser, asUser, validGame, createGame, daysFromNow } = require('./helpers');

test.describe('Posting a game', () => {
  test('creates a game with the host in the first spot', async ({ request }) => {
    const host = newUser('host');
    const res = await request.post('/games', { headers: asUser(host), data: validGame({ capacity: 8 }) });

    expect(res.status()).toBe(201);
    const game = await res.json();
    expect(game).toMatchObject({ hostId: host, status: 'open', type: 'casual', playerCount: 1, spotsLeft: 7 });
    expect(game.id).toBeTruthy();
  });

  test('requires a user', async ({ request }) => {
    const res = await request.post('/games', { data: validGame() });
    expect(res.status()).toBe(401);
  });

  test('rejects malformed JSON', async ({ request }) => {
    const res = await request.post('/games', {
      headers: { ...asUser(newUser()), 'Content-Type': 'application/json' },
      data: '{not json',
    });
    expect(res.status()).toBe(400);
  });

  // Table-driven: one test per bad input, each with a clear name in the report
  const invalidCases = [
    { name: 'title too short', data: { title: 'ab' }, error: 'title' },
    { name: 'unknown sport', data: { sport: 'quidditch' }, error: 'sport' },
    { name: 'capacity of 1', data: { capacity: 1 }, error: 'capacity' },
    { name: 'capacity over 100', data: { capacity: 101 }, error: 'capacity' },
    { name: 'capacity not a whole number', data: { capacity: 5.5 }, error: 'capacity' },
    { name: 'start time in the past', data: { startsAt: daysFromNow(-1) }, error: 'future' },
    { name: 'start time not a date', data: { startsAt: 'next tuesday' }, error: 'startsAt' },
    { name: 'invalid type', data: { type: 'league' }, error: 'type' },
    { name: 'missing location', data: { location: undefined }, error: 'location' },
    {
      name: 'location outside the Illawarra (Sydney CBD)',
      data: { location: { name: 'Town Hall', lat: -33.873, lng: 151.206 } },
      error: 'Illawarra',
    },
  ];

  for (const { name, data, error } of invalidCases) {
    test(`rejects ${name}`, async ({ request }) => {
      const res = await request.post('/games', { headers: asUser(newUser()), data: validGame(data) });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.errors.join(' ')).toContain(error);
    });
  }
});

test.describe('One active game per person', () => {
  test('blocks a second post while the first is active', async ({ request }) => {
    const host = newUser('host');
    const first = await createGame(request, host);

    const res = await request.post('/games', { headers: asUser(host), data: validGame({ title: 'Another one' }) });
    expect(res.status()).toBe(409);
    expect((await res.json()).gameId).toBe(first.id);
  });

  test('allows a new post after cancelling the first', async ({ request }) => {
    const host = newUser('host');
    const first = await createGame(request, host);
    await request.delete(`/games/${first.id}`, { headers: asUser(host) });

    const res = await request.post('/games', { headers: asUser(host), data: validGame({ title: 'Take two' }) });
    expect(res.status()).toBe(201);
  });

  test('counts an unpaid tournament as active', async ({ request }) => {
    const host = newUser('host');
    await createGame(request, host, { type: 'tournament' });

    const res = await request.post('/games', { headers: asUser(host), data: validGame() });
    expect(res.status()).toBe(409);
  });
});

test.describe('Cancelling', () => {
  test('only the host can cancel', async ({ request }) => {
    const game = await createGame(request, newUser('host'));
    const res = await request.delete(`/games/${game.id}`, { headers: asUser(newUser('stranger')) });
    expect(res.status()).toBe(403);
  });

  test('host cancels and the game shows as cancelled', async ({ request }) => {
    const host = newUser('host');
    const game = await createGame(request, host);
    const res = await request.delete(`/games/${game.id}`, { headers: asUser(host) });
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe('cancelled');
  });
});
