const { test, expect } = require('@playwright/test');
const { newUser, asUser, asAdmin, asAdminUser, createGame } = require('./helpers');

// A game with a host, a player, and a comment from the player
async function setup(request) {
  const host = newUser('host');
  const player = newUser('player');
  const game = await createGame(request, host);
  await request.post(`/games/${game.id}/join`, { headers: asUser(player) });
  const comment = await (await request.post(`/games/${game.id}/comments`, {
    headers: asUser(player), data: { body: 'Buy cheap watches at spam.example' },
  })).json();
  return { host, player, game, comment, url: `/games/${game.id}/comments/${comment.id}/report` };
}

test.describe('Reporting a comment', () => {
  test("a player can report someone else's comment, once", async ({ request }) => {
    const { host, url } = await setup(request);
    expect((await request.post(url, { headers: asUser(host), data: { reason: 'Spam link' } })).status()).toBe(201);
    expect((await request.post(url, { headers: asUser(host), data: { reason: 'Still spam' } })).status()).toBe(409);
  });

  test("you can't report your own comment", async ({ request }) => {
    const { player, url } = await setup(request);
    expect((await request.post(url, { headers: asUser(player), data: { reason: 'Oops' } })).status()).toBe(400);
  });

  test('people outside the game cannot report its comments', async ({ request }) => {
    const { url } = await setup(request);
    expect((await request.post(url, { headers: asUser(newUser('outsider')), data: { reason: 'Spam' } })).status()).toBe(403);
  });

  test('a report needs a reason', async ({ request }) => {
    const { host, url } = await setup(request);
    expect((await request.post(url, { headers: asUser(host), data: { reason: '' } })).status()).toBe(400);
  });
});

test.describe('Admins', () => {
  test('members of the admins group can use admin routes; others cannot', async ({ request }) => {
    expect((await request.get('/admin/reported', { headers: asAdminUser(newUser('mod')) })).status()).toBe(200);
    expect((await request.get('/admin/reported', { headers: asUser(newUser('regular')) })).status()).toBe(403);
    expect((await request.get('/admin/reported')).status()).toBe(403);
  });

  test('/me tells the app whether someone is an admin', async ({ request }) => {
    expect((await (await request.get('/me', { headers: asAdminUser(newUser('mod')) })).json()).isAdmin).toBe(true);
    expect((await (await request.get('/me', { headers: asUser(newUser('regular')) })).json()).isAdmin).toBe(false);
  });

  test('reported comments arrive with their reasons, game and author', async ({ request }) => {
    const { host, game, comment, url } = await setup(request);
    await request.post(url, { headers: asUser(host), data: { reason: 'Spam link' } });

    const { comments } = await (await request.get('/admin/reported', { headers: asAdmin() })).json();
    const found = comments.find((c) => c.id === comment.id);
    expect(found).toMatchObject({ body: 'Buy cheap watches at spam.example', gameId: game.id, gameTitle: game.title });
    expect(found.reports.map((r) => r.reason)).toEqual(['Spam link']);
  });

  test('an admin can delete a reported comment', async ({ request }) => {
    const { host, player, game, comment, url } = await setup(request);
    await request.post(url, { headers: asUser(host), data: { reason: 'Spam link' } });

    expect((await request.delete(`/admin/comments/${comment.id}`, { headers: asAdmin() })).status()).toBe(204);
    const left = await (await request.get(`/games/${game.id}/comments`, { headers: asUser(player) })).json();
    expect(left).toEqual([]);
    const { comments } = await (await request.get('/admin/reported', { headers: asAdmin() })).json();
    expect(comments.map((c) => c.id)).not.toContain(comment.id); // its reports went with it
  });

  test('dismissing comment reports keeps the comment', async ({ request }) => {
    const { host, player, game, comment, url } = await setup(request);
    await request.post(url, { headers: asUser(host), data: { reason: 'Not sure' } });
    await request.post(`/admin/comments/${comment.id}/reports/dismiss`, { headers: asAdmin() });

    const { comments } = await (await request.get('/admin/reported', { headers: asAdmin() })).json();
    expect(comments.map((c) => c.id)).not.toContain(comment.id);
    const still = await (await request.get(`/games/${game.id}/comments`, { headers: asUser(player) })).json();
    expect(still.map((c) => c.id)).toContain(comment.id);
  });

  test('reported games appear, and dismissing keeps the game', async ({ request }) => {
    const game = await createGame(request, newUser('host'));
    await request.post(`/games/${game.id}/report`, { headers: asUser(newUser('r')), data: { reason: 'Looks fake' } });

    let { games } = await (await request.get('/admin/reported', { headers: asAdmin() })).json();
    expect(games.find((g) => g.id === game.id).reports[0].reason).toBe('Looks fake');

    await request.post(`/admin/games/${game.id}/reports/dismiss`, { headers: asAdmin() });
    ({ games } = await (await request.get('/admin/reported', { headers: asAdmin() })).json());
    expect(games.map((g) => g.id)).not.toContain(game.id);
    expect((await request.get(`/games/${game.id}`)).status()).toBe(200);
  });

  test('banned people are listed and can be unbanned', async ({ request }) => {
    const person = newUser('banme');
    await request.patch('/me', { headers: asUser(person), data: { name: 'Banme' } });
    await request.post(`/admin/users/${person}/ban`, { headers: asAdmin() });

    const banned = await (await request.get('/admin/banned', { headers: asAdmin() })).json();
    expect(banned.find((b) => b.userId === person).name).toBe('Banme');

    expect((await request.post(`/admin/users/${person}/unban`, { headers: asAdmin() })).status()).toBe(200);
    expect((await request.post('/games', { headers: asUser(person), data: require('./helpers').validGame() })).status()).toBe(201);
    expect((await request.post(`/admin/users/${person}/unban`, { headers: asAdmin() })).status()).toBe(404);
  });
});
