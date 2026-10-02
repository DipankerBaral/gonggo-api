const { test, expect } = require('@playwright/test');
const { newUser, asUser, asAdmin, createGame } = require('./helpers');

// A game with a host and one player who has joined
async function gameWithPlayer(request) {
  const host = newUser('host');
  const player = newUser('player');
  const game = await createGame(request, host);
  await request.post(`/games/${game.id}/join`, { headers: asUser(player) });
  return { game, host, player, url: `/games/${game.id}/comments` };
}

test.describe('Comments', () => {
  test('players and the host can post and read comments, oldest first', async ({ request }) => {
    const { host, player, url } = await gameWithPlayer(request);
    await request.patch('/me', { headers: asUser(player), data: { name: 'Zoe' } });

    expect((await request.post(url, { headers: asUser(player), data: { body: 'Is there parking?' } })).status()).toBe(201);
    expect((await request.post(url, { headers: asUser(host), data: { body: 'Yes, behind the courts.' } })).status()).toBe(201);

    const comments = await (await request.get(url, { headers: asUser(player) })).json();
    expect(comments.map((c) => c.body)).toEqual(['Is there parking?', 'Yes, behind the courts.']);
    expect(comments[0]).toMatchObject({ authorName: 'Zoe', isHost: false, canDelete: true });
    expect(comments[1]).toMatchObject({ isHost: true, canDelete: false });
  });

  test('people who are not in the game can neither read nor post', async ({ request }) => {
    const { url } = await gameWithPlayer(request);
    const outsider = asUser(newUser('outsider'));
    expect((await request.get(url, { headers: outsider })).status()).toBe(403);
    expect((await request.post(url, { headers: outsider, data: { body: 'hi' } })).status()).toBe(403);
  });

  test('signing in is required', async ({ request }) => {
    const { url } = await gameWithPlayer(request);
    expect((await request.get(url)).status()).toBe(401);
    expect((await request.post(url, { data: { body: 'hi' } })).status()).toBe(401);
  });

  test('a player who leaves loses access', async ({ request }) => {
    const { game, player, url } = await gameWithPlayer(request);
    await request.delete(`/games/${game.id}/join`, { headers: asUser(player) });
    expect((await request.get(url, { headers: asUser(player) })).status()).toBe(403);
  });

  for (const [label, body] of [['empty', '   '], ['over 500 characters', 'x'.repeat(501)]]) {
    test(`rejects a comment that is ${label}`, async ({ request }) => {
      const { player, url } = await gameWithPlayer(request);
      expect((await request.post(url, { headers: asUser(player), data: { body } })).status()).toBe(400);
    });
  }

  test('comment text is stored exactly, so the page must escape it', async ({ request }) => {
    const { player, url } = await gameWithPlayer(request);
    const body = '<script>alert(1)</script>';
    await request.post(url, { headers: asUser(player), data: { body } });
    const comments = await (await request.get(url, { headers: asUser(player) })).json();
    expect(comments[0].body).toBe(body); // the UI test checks it is shown as text
  });

  test('authors can delete their own comments; others cannot', async ({ request }) => {
    const { game, player, url } = await gameWithPlayer(request);
    const other = newUser('other');
    await request.post(`/games/${game.id}/join`, { headers: asUser(other) });
    const comment = await (await request.post(url, { headers: asUser(player), data: { body: 'Oops' } })).json();

    expect((await request.delete(`${url}/${comment.id}`, { headers: asUser(other) })).status()).toBe(403);
    expect((await request.delete(`${url}/${comment.id}`, { headers: asUser(player) })).status()).toBe(204);
    expect(await (await request.get(url, { headers: asUser(player) })).json()).toEqual([]);
  });

  test('the host can delete any comment in their game', async ({ request }) => {
    const { host, player, url } = await gameWithPlayer(request);
    const comment = await (await request.post(url, { headers: asUser(player), data: { body: 'Spam link' } })).json();
    expect((await request.delete(`${url}/${comment.id}`, { headers: asUser(host) })).status()).toBe(204);
  });

  test('deleting a comment that does not exist returns 404', async ({ request }) => {
    const { player, url } = await gameWithPlayer(request);
    expect((await request.delete(`${url}/not-a-real-id`, { headers: asUser(player) })).status()).toBe(404);
  });

  test('a game removed by an admin takes its comments with it', async ({ request }) => {
    const { game, player, url } = await gameWithPlayer(request);
    await request.post(`/admin/games/${game.id}/remove`, { headers: asAdmin(), data: { reason: 'Spam' } });
    expect((await request.get(url, { headers: asUser(player) })).status()).toBe(404);
  });

  test('banned users cannot comment', async ({ request }) => {
    const { player, url } = await gameWithPlayer(request);
    await request.post(`/admin/users/${player}/ban`, { headers: asAdmin() });
    expect((await request.post(url, { headers: asUser(player), data: { body: 'hi' } })).status()).toBe(403);
  });
});
