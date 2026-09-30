const { test, expect } = require('@playwright/test');
const { newUser, asUser, asAdmin, validGame, createGame } = require('./helpers');

test.describe('Reporting', () => {
  test('a user can report a game once', async ({ request }) => {
    const game = await createGame(request, newUser('host'));
    const reporter = newUser('reporter');

    const first = await request.post(`/games/${game.id}/report`, { headers: asUser(reporter), data: { reason: 'Looks like spam' } });
    expect(first.status()).toBe(201);

    const again = await request.post(`/games/${game.id}/report`, { headers: asUser(reporter), data: { reason: 'Still spam' } });
    expect(again.status()).toBe(409);
  });

  test('a report needs a reason', async ({ request }) => {
    const game = await createGame(request, newUser('host'));
    const res = await request.post(`/games/${game.id}/report`, { headers: asUser(newUser()), data: { reason: '' } });
    expect(res.status()).toBe(400);
  });
});

test.describe('Admin', () => {
  test('admin routes need the admin key', async ({ request }) => {
    expect((await request.get('/admin/games')).status()).toBe(403);
    expect((await request.get('/admin/games', { headers: { 'x-admin-key': 'wrong' } })).status()).toBe(403);
  });

  test('admin sees report counts on games', async ({ request }) => {
    const game = await createGame(request, newUser('host'));
    await request.post(`/games/${game.id}/report`, { headers: asUser(newUser()), data: { reason: 'Rude title' } });
    await request.post(`/games/${game.id}/report`, { headers: asUser(newUser()), data: { reason: 'Fake game' } });

    const games = await (await request.get('/admin/games', { headers: asAdmin() })).json();
    expect(games.find((g) => g.id === game.id).reportCount).toBe(2);
  });

  test('removing a game hides it everywhere', async ({ request }) => {
    const game = await createGame(request, newUser('host'));
    const res = await request.post(`/admin/games/${game.id}/remove`, { headers: asAdmin(), data: { reason: 'Spam' } });
    expect(res.status()).toBe(200);

    expect((await request.get(`/games/${game.id}`)).status()).toBe(404);
    const list = await (await request.get('/games')).json();
    expect(list.map((g) => g.id)).not.toContain(game.id);
  });

  test('removing needs a reason', async ({ request }) => {
    const game = await createGame(request, newUser('host'));
    const res = await request.post(`/admin/games/${game.id}/remove`, { headers: asAdmin(), data: {} });
    expect(res.status()).toBe(400);
  });

  test('approving a tournament publishes it', async ({ request }) => {
    const game = await createGame(request, newUser('host'), { type: 'tournament', capacity: 32 });
    const res = await request.post(`/admin/games/${game.id}/approve`, { headers: asAdmin() });
    expect((await res.json()).status).toBe('open');

    const list = await (await request.get('/games')).json();
    expect(list.map((g) => g.id)).toContain(game.id);
  });

  test('casual games cannot be "approved"', async ({ request }) => {
    const game = await createGame(request, newUser('host'));
    const res = await request.post(`/admin/games/${game.id}/approve`, { headers: asAdmin() });
    expect(res.status()).toBe(409);
  });

  test('banning a user removes their games and blocks them', async ({ request }) => {
    const baddie = newUser('baddie');
    const game = await createGame(request, baddie);
    const other = await createGame(request, newUser('host'));

    const ban = await request.post(`/admin/users/${baddie}/ban`, { headers: asAdmin() });
    expect((await ban.json()).removedGames).toEqual([game.id]);

    expect((await request.get(`/games/${game.id}`)).status()).toBe(404);
    expect((await request.post('/games', { headers: asUser(baddie), data: validGame() })).status()).toBe(403);
    expect((await request.post(`/games/${other.id}/join`, { headers: asUser(baddie) })).status()).toBe(403);
  });
});
