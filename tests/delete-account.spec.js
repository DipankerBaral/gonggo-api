const { test, expect } = require('@playwright/test');
const { newUser, asUser, asAdmin, createGame } = require('./helpers');

test.describe('Deleting an account', () => {
  test('requires sign-in', async ({ request }) => {
    expect((await request.delete('/me')).status()).toBe(401);
  });

  test("removes the person's games, spots, comments and reports", async ({ request }) => {
    const me = newUser('leaving');
    const other = newUser('other');

    const mine = await createGame(request, me);                    // a game I host
    const theirs = await createGame(request, other, { capacity: 4 }); // a game I joined
    await request.post(`/games/${theirs.id}/join`, { headers: asUser(me) });
    await request.post(`/games/${theirs.id}/comments`, { headers: asUser(me), data: { body: 'See you there' } });
    await request.post(`/games/${theirs.id}/report`, { headers: asUser(me), data: { reason: 'Testing reports' } });

    const res = await request.delete('/me', { headers: asUser(me) });
    expect(res.status()).toBe(200);
    expect((await res.json()).deletedGames).toEqual([mine.id]);

    expect((await request.get(`/games/${mine.id}`)).status()).toBe(404);
    const detail = await (await request.get(`/games/${theirs.id}`)).json();
    expect(detail.players.map((p) => p.id)).toEqual([other]);
    expect(detail.spotsLeft).toBe(3);
    const comments = await (await request.get(`/games/${theirs.id}/comments`, { headers: asUser(other) })).json();
    expect(comments).toEqual([]);
    const { games } = await (await request.get('/admin/reported', { headers: asAdmin() })).json();
    expect(games.map((g) => g.id)).not.toContain(theirs.id);
  });

  test("other people's games and comments are untouched", async ({ request }) => {
    const me = newUser('leaving');
    const other = newUser('other');
    const theirs = await createGame(request, other);
    await request.post(`/games/${theirs.id}/comments`, { headers: asUser(other), data: { body: 'Host here' } });
    await request.post(`/games/${theirs.id}/join`, { headers: asUser(me) });
    await request.delete('/me', { headers: asUser(me) });

    const comments = await (await request.get(`/games/${theirs.id}/comments`, { headers: asUser(other) })).json();
    expect(comments.map((c) => c.body)).toEqual(['Host here']);
  });

  test('deleting an account does not undo a ban', async ({ request }) => {
    const me = newUser('banned');
    await request.get('/me', { headers: asUser(me) });
    await request.post(`/admin/users/${me}/ban`, { headers: asAdmin() });
    const banned = await (await request.get('/admin/banned', { headers: asAdmin() })).json();
    expect(banned.map((b) => b.userId)).toContain(me);
  });
});
