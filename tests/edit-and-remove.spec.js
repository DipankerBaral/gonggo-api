const { test, expect } = require('@playwright/test');
const { newUser, asUser, validGame, createGame, daysFromNow } = require('./helpers');

const secondsFromNow = (s) => new Date(Date.now() + s * 1000).toISOString();

test.describe('How long a game runs', () => {
  test('defaults to 90 minutes and reports when it ends', async ({ request }) => {
    const startsAt = daysFromNow(2);
    const game = await createGame(request, newUser('host'), { startsAt });
    expect(game.durationMinutes).toBe(90);
    expect(new Date(game.endsAt) - new Date(startsAt)).toBe(90 * 60 * 1000);
  });

  for (const [label, durationMinutes] of [['under 15 minutes', 10], ['over 12 hours', 721], ['not a whole number', 60.5]]) {
    test(`rejects a duration ${label}`, async ({ request }) => {
      const res = await request.post('/games', { headers: asUser(newUser()), data: validGame({ durationMinutes }) });
      expect(res.status()).toBe(400);
    });
  }

  test('a game that has started stays listed and joinable until it ends', async ({ request }) => {
    const game = await createGame(request, newUser('host'), { startsAt: secondsFromNow(2), durationMinutes: 15 });
    await new Promise((r) => setTimeout(r, 2500)); // let it start

    const list = await (await request.get('/games')).json();
    expect(list.map((g) => g.id)).toContain(game.id);
    const late = await request.post(`/games/${game.id}/join`, { headers: asUser(newUser('late')) });
    expect(late.status()).toBe(200);
  });
});

test.describe('Editing a game', () => {
  test('the host can change the details; anything left out stays the same', async ({ request }) => {
    const host = newUser('host');
    const game = await createGame(request, host, { title: 'Before', capacity: 8, description: 'Old notes' });
    const newStart = daysFromNow(5);

    const res = await request.patch(`/games/${game.id}`, {
      headers: asUser(host),
      data: { title: 'After', startsAt: newStart, durationMinutes: 120, location: { name: 'Beaton Park', lat: -34.415, lng: 150.8845 } },
    });
    expect(res.status()).toBe(200);
    const edited = await res.json();
    expect(edited).toMatchObject({ title: 'After', durationMinutes: 120, capacity: 8, description: 'Old notes' });
    expect(edited.location.name).toBe('Beaton Park');
    expect(new Date(edited.startsAt).toISOString()).toBe(new Date(newStart).toISOString());
    expect(edited.updatedAt).toBeTruthy();
    expect(edited.changed.sort()).toEqual(['durationMinutes', 'location', 'startsAt', 'title']);
  });

  test('players keep their spots when the game is edited', async ({ request }) => {
    const host = newUser('host');
    const player = newUser('player');
    const game = await createGame(request, host);
    await request.post(`/games/${game.id}/join`, { headers: asUser(player) });
    await request.patch(`/games/${game.id}`, { headers: asUser(host), data: { startsAt: daysFromNow(6) } });

    const detail = await (await request.get(`/games/${game.id}`)).json();
    expect(detail.players.map((p) => p.id)).toEqual([host, player]);
  });

  test('only the host can edit', async ({ request }) => {
    const game = await createGame(request, newUser('host'));
    const res = await request.patch(`/games/${game.id}`, { headers: asUser(newUser('stranger')), data: { title: 'Mine now' } });
    expect(res.status()).toBe(403);
  });

  test("capacity can't drop below the people already in", async ({ request }) => {
    const host = newUser('host');
    const game = await createGame(request, host, { capacity: 5 });
    await request.post(`/games/${game.id}/join`, { headers: asUser(newUser('a')) });
    await request.post(`/games/${game.id}/join`, { headers: asUser(newUser('b')) });

    const res = await request.patch(`/games/${game.id}`, { headers: asUser(host), data: { capacity: 2 } });
    expect(res.status()).toBe(400);
    expect((await res.json()).errors[0]).toContain('3 people already in the game');
  });

  test('edits are validated like a new game', async ({ request }) => {
    const host = newUser('host');
    const game = await createGame(request, host);
    for (const data of [{ startsAt: daysFromNow(-1) }, { title: 'x' }, { location: { name: 'CBD', lat: -33.87, lng: 151.2 } }, {}]) {
      expect((await request.patch(`/games/${game.id}`, { headers: asUser(host), data })).status()).toBe(400);
    }
  });

  test('a game that has started can still have its notes fixed', async ({ request }) => {
    const host = newUser('host');
    const game = await createGame(request, host, { startsAt: secondsFromNow(2), durationMinutes: 15 });
    await new Promise((r) => setTimeout(r, 2500));

    const res = await request.patch(`/games/${game.id}`, { headers: asUser(host), data: { description: 'We moved to court 2' } });
    expect(res.status()).toBe(200);
  });

  test('a cancelled game cannot be edited', async ({ request }) => {
    const host = newUser('host');
    const game = await createGame(request, host);
    await request.delete(`/games/${game.id}`, { headers: asUser(host) });
    expect((await request.patch(`/games/${game.id}`, { headers: asUser(host), data: { title: 'Back on' } })).status()).toBe(409);
  });
});

test.describe('Removing a player', () => {
  test('the host can remove a player, who then cannot rejoin', async ({ request }) => {
    const host = newUser('host');
    const player = newUser('player');
    const game = await createGame(request, host, { capacity: 4 });
    await request.post(`/games/${game.id}/join`, { headers: asUser(player) });

    const res = await request.delete(`/games/${game.id}/players/${player}`, { headers: asUser(host) });
    expect(res.status()).toBe(200);
    expect((await res.json()).spotsLeft).toBe(3);

    const again = await request.post(`/games/${game.id}/join`, { headers: asUser(player) });
    expect(again.status()).toBe(403);
    expect((await again.json()).error).toBe('The host has removed you from this game.');
  });

  test('only the host can remove players', async ({ request }) => {
    const host = newUser('host');
    const player = newUser('player');
    const game = await createGame(request, host);
    await request.post(`/games/${game.id}/join`, { headers: asUser(player) });
    const res = await request.delete(`/games/${game.id}/players/${player}`, { headers: asUser(newUser('other')) });
    expect(res.status()).toBe(403);
  });

  test("the host can't remove themselves", async ({ request }) => {
    const host = newUser('host');
    const game = await createGame(request, host);
    expect((await request.delete(`/games/${game.id}/players/${host}`, { headers: asUser(host) })).status()).toBe(400);
  });

  test('removing someone who is not in the game returns 404', async ({ request }) => {
    const host = newUser('host');
    const game = await createGame(request, host);
    expect((await request.delete(`/games/${game.id}/players/${newUser('ghost')}`, { headers: asUser(host) })).status()).toBe(404);
  });
});
