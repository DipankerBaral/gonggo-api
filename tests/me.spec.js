const { test, expect } = require('@playwright/test');
const { newUser, asUser, asAdmin, createGame, daysFromNow } = require('./helpers');

const ids = (games) => games.map((g) => g.id);

test.describe('My games', () => {
  test('requires a user', async ({ request }) => {
    expect((await request.get('/me/games')).status()).toBe(401);
  });

  test('lists games I host and games I joined, with my role, soonest first', async ({ request }) => {
    const me = newUser('me');
    const hosting = await createGame(request, me, { startsAt: daysFromNow(4) });
    const joined = await createGame(request, newUser('host'), { startsAt: daysFromNow(2) });
    await request.post(`/games/${joined.id}/join`, { headers: asUser(me) });

    const body = await (await request.get('/me/games', { headers: asUser(me) })).json();
    expect(body.historyDays).toBe(30);
    expect(ids(body.upcoming)).toEqual([joined.id, hosting.id]);
    expect(body.upcoming.find((g) => g.id === hosting.id).role).toBe('host');
    expect(body.upcoming.find((g) => g.id === joined.id).role).toBe('player');
    expect(body.past).toEqual([]);
  });

  test("doesn't include other people's games", async ({ request }) => {
    const me = newUser('me');
    const notMine = await createGame(request, newUser('host'));

    const body = await (await request.get('/me/games', { headers: asUser(me) })).json();
    expect(ids(body.upcoming)).not.toContain(notMine.id);
  });

  test('a game I left disappears from my list', async ({ request }) => {
    const me = newUser('me');
    const game = await createGame(request, newUser('host'));
    await request.post(`/games/${game.id}/join`, { headers: asUser(me) });
    await request.delete(`/games/${game.id}/join`, { headers: asUser(me) });

    const body = await (await request.get('/me/games', { headers: asUser(me) })).json();
    expect(ids(body.upcoming)).not.toContain(game.id);
  });

  test('a cancelled game stays in my list, marked cancelled', async ({ request }) => {
    const me = newUser('me');
    const host = newUser('host');
    const game = await createGame(request, host);
    await request.post(`/games/${game.id}/join`, { headers: asUser(me) });
    await request.delete(`/games/${game.id}`, { headers: asUser(host) });

    const body = await (await request.get('/me/games', { headers: asUser(me) })).json();
    expect(body.upcoming.find((g) => g.id === game.id).status).toBe('cancelled');
  });

  test('a game removed by an admin is hidden', async ({ request }) => {
    const me = newUser('me');
    const game = await createGame(request, me);
    await request.post(`/admin/games/${game.id}/remove`, { headers: asAdmin(), data: { reason: 'Spam' } });

    const body = await (await request.get('/me/games', { headers: asUser(me) })).json();
    expect(ids(body.upcoming)).not.toContain(game.id);
  });
});
