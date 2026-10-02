const { test, expect } = require('@playwright/test');
const { listAll, newUser, asUser, createGame, daysFromNow } = require('./helpers');

// Other tests create games at the same time, so these tests check for
// *their own* games in the list rather than counting everything.
const ids = (games) => games.map((g) => g.id);

test.describe('Browsing games', () => {
  test('lists open games with spots left but hides the player list', async ({ request }) => {
    const game = await createGame(request, newUser('host'), { capacity: 6 });
    const list = await listAll(request);

    const found = list.find((g) => g.id === game.id);
    expect(found).toMatchObject({ spotsLeft: 5, playerCount: 1 });
    expect(found.players).toBeUndefined();
  });

  test('hides cancelled games', async ({ request }) => {
    const host = newUser('host');
    const game = await createGame(request, host);
    await request.delete(`/games/${game.id}`, { headers: asUser(host) });

    const list = await listAll(request);
    expect(ids(list)).not.toContain(game.id);
  });

  test('hides tournaments until they are approved', async ({ request }) => {
    const game = await createGame(request, newUser('host'), { type: 'tournament' });
    expect(game.status).toBe('pending_payment');

    const list = await listAll(request);
    expect(ids(list)).not.toContain(game.id);
  });

  test('filters by sport', async ({ request }) => {
    const hoops = await createGame(request, newUser('host'), { sport: 'basketball' });
    const run = await createGame(request, newUser('host'), { sport: 'running' });

    const list = await listAll(request, 'sport=basketball');
    expect(ids(list)).toContain(hoops.id);
    expect(ids(list)).not.toContain(run.id);
    expect(list.every((g) => g.sport === 'basketball')).toBe(true);
  });

  test('hasSpots=true leaves out full games', async ({ request }) => {
    const full = await createGame(request, newUser('host'), { capacity: 2 });
    await request.post(`/games/${full.id}/join`, { headers: asUser(newUser('player')) });
    const open = await createGame(request, newUser('host'), { capacity: 5 });

    const list = await listAll(request, 'hasSpots=true');
    expect(ids(list)).toContain(open.id);
    expect(ids(list)).not.toContain(full.id);
  });

  test('sorts by start time, soonest first', async ({ request }) => {
    const later = await createGame(request, newUser('host'), { startsAt: daysFromNow(9) });
    const sooner = await createGame(request, newUser('host'), { startsAt: daysFromNow(8) });

    const list = ids(await listAll(request));
    expect(list.indexOf(sooner.id)).toBeLessThan(list.indexOf(later.id));
  });

  test('game detail includes the players', async ({ request }) => {
    const host = newUser('host');
    const player = newUser('player');
    const game = await createGame(request, host);
    await request.post(`/games/${game.id}/join`, { headers: asUser(player) });

    const detail = await (await request.get(`/games/${game.id}`)).json();
    expect(detail.players.map((p) => p.id)).toEqual([host, player]);
  });

  test('unknown game returns 404', async ({ request }) => {
    const res = await request.get('/games/not-a-real-id');
    expect(res.status()).toBe(404);
  });
});
