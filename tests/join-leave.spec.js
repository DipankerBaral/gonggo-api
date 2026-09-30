const { test, expect } = require('@playwright/test');
const { newUser, asUser, createGame } = require('./helpers');

test.describe('Joining and leaving', () => {
  test('joining takes a spot', async ({ request }) => {
    const game = await createGame(request, newUser('host'), { capacity: 4 });
    const res = await request.post(`/games/${game.id}/join`, { headers: asUser(newUser('player')) });

    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ playerCount: 2, spotsLeft: 2 });
  });

  test('a full game rejects new players', async ({ request }) => {
    const game = await createGame(request, newUser('host'), { capacity: 2 });
    await request.post(`/games/${game.id}/join`, { headers: asUser(newUser('player')) });

    const res = await request.post(`/games/${game.id}/join`, { headers: asUser(newUser('late')) });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('No spots left');
  });

  test('you cannot join the same game twice', async ({ request }) => {
    const game = await createGame(request, newUser('host'));
    const player = newUser('player');
    await request.post(`/games/${game.id}/join`, { headers: asUser(player) });

    const res = await request.post(`/games/${game.id}/join`, { headers: asUser(player) });
    expect(res.status()).toBe(409);
  });

  test('the host is already in and cannot join again', async ({ request }) => {
    const host = newUser('host');
    const game = await createGame(request, host);
    const res = await request.post(`/games/${game.id}/join`, { headers: asUser(host) });
    expect(res.status()).toBe(409);
  });

  test('leaving frees the spot', async ({ request }) => {
    const game = await createGame(request, newUser('host'), { capacity: 3 });
    const player = newUser('player');
    await request.post(`/games/${game.id}/join`, { headers: asUser(player) });

    const res = await request.delete(`/games/${game.id}/join`, { headers: asUser(player) });
    expect(res.status()).toBe(200);
    expect((await res.json()).spotsLeft).toBe(2);
  });

  test('the host cannot leave, only cancel', async ({ request }) => {
    const host = newUser('host');
    const game = await createGame(request, host);
    const res = await request.delete(`/games/${game.id}/join`, { headers: asUser(host) });
    expect(res.status()).toBe(400);
  });

  test('leaving a game you are not in fails', async ({ request }) => {
    const game = await createGame(request, newUser('host'));
    const res = await request.delete(`/games/${game.id}/join`, { headers: asUser(newUser('stranger')) });
    expect(res.status()).toBe(409);
  });

  test('you cannot join a cancelled game', async ({ request }) => {
    const host = newUser('host');
    const game = await createGame(request, host);
    await request.delete(`/games/${game.id}`, { headers: asUser(host) });

    const res = await request.post(`/games/${game.id}/join`, { headers: asUser(newUser('player')) });
    expect(res.status()).toBe(404);
  });

  test('joining requires a user', async ({ request }) => {
    const game = await createGame(request, newUser('host'));
    const res = await request.post(`/games/${game.id}/join`);
    expect(res.status()).toBe(401);
  });
});
