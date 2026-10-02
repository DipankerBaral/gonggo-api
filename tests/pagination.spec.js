const { test, expect } = require('@playwright/test');
const { newUser, createGame, listAll } = require('./helpers');

const inHours = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const tag = () => `pg${Math.random().toString(36).slice(2, 8)}`;

// Make `n` games whose titles share a tag, so a search finds just these
async function tagged(request, n, overrides = {}) {
  const t = tag();
  const games = [];
  for (let i = 0; i < n; i++) {
    games.push(await createGame(request, newUser('host'), { title: `${t} game ${i}`, startsAt: inHours(10 + i), ...overrides }));
  }
  return { t, games };
}

test.describe('Pages of games', () => {
  test('returns one page at a time, with a cursor for the next', async ({ request }) => {
    const { t, games } = await tagged(request, 5);
    const first = await (await request.get(`/games?q=${t}&limit=2`)).json();
    expect(first.games.map((g) => g.id)).toEqual([games[0].id, games[1].id]);
    expect(first.total).toBe(5);
    expect(first.nextCursor).toBeTruthy();

    const second = await (await request.get(`/games?q=${t}&limit=2&cursor=${first.nextCursor}`)).json();
    expect(second.games.map((g) => g.id)).toEqual([games[2].id, games[3].id]);
    const third = await (await request.get(`/games?q=${t}&limit=2&cursor=${second.nextCursor}`)).json();
    expect(third.games.map((g) => g.id)).toEqual([games[4].id]);
    expect(third.nextCursor).toBeNull(); // the end
  });

  test('pages never repeat or skip a game, even with identical start times', async ({ request }) => {
    const sameTime = inHours(50);
    const { t, games } = await tagged(request, 7, { startsAt: sameTime });
    const seen = (await listAll(request, `q=${t}`)).map((g) => g.id);
    expect(seen.sort()).toEqual(games.map((g) => g.id).sort());
    expect(new Set(seen).size).toBe(7);
  });

  test('a page has 20 games unless asked otherwise, and never more than 100', async ({ request }) => {
    expect((await (await request.get('/games')).json()).games.length).toBeLessThanOrEqual(20);
    expect((await (await request.get('/games?limit=500')).json()).games.length).toBeLessThanOrEqual(100);
  });

  test('a made-up cursor is rejected', async ({ request }) => {
    expect((await request.get('/games?cursor=not-a-real-cursor')).status()).toBe(400);
  });
});

test.describe('Searching', () => {
  test('finds games by title or by place, ignoring case', async ({ request }) => {
    const t = tag();
    const byTitle = await createGame(request, newUser('host'), { title: `Futsal ${t}` });
    const byPlace = await createGame(request, newUser('host'), {
      title: 'Evening hit', location: { name: `Thirroul ${t} courts`, lat: -34.32, lng: 150.92 },
    });
    const found = (await (await request.get(`/games?q=${t.toUpperCase()}`)).json()).games.map((g) => g.id);
    expect(found.sort()).toEqual([byTitle.id, byPlace.id].sort());
  });

  test('% and _ are searched for literally', async ({ request }) => {
    const t = tag();
    const game = await createGame(request, newUser('host'), { title: `100% fun ${t}` });
    const found = await (await request.get(`/games?q=${encodeURIComponent(`100% fun ${t}`)}`)).json();
    expect(found.games.map((g) => g.id)).toEqual([game.id]);
    expect((await (await request.get(`/games?q=${encodeURIComponent(`1_0% fun ${t}`)}`)).json()).total).toBe(0);
  });
});

test.describe('When', () => {
  test("'week' keeps games starting in the next 7 days", async ({ request }) => {
    const t = tag();
    const soon = await createGame(request, newUser('host'), { title: `${t} soon`, startsAt: inHours(24) });
    await createGame(request, newUser('host'), { title: `${t} later`, startsAt: inHours(24 * 9) });
    const found = await (await request.get(`/games?q=${t}&when=week`)).json();
    expect(found.games.map((g) => g.id)).toEqual([soon.id]);
  });

  test("'today' includes a game that has already started", async ({ request }) => {
    const t = tag();
    const game = await createGame(request, newUser('host'), { title: `${t} live`, startsAt: new Date(Date.now() + 1500).toISOString(), durationMinutes: 30 });
    await new Promise((r) => setTimeout(r, 2000));
    const found = await (await request.get(`/games?q=${t}&when=today`)).json();
    expect(found.games.map((g) => g.id)).toEqual([game.id]);
  });

  test('an unknown "when" is rejected', async ({ request }) => {
    expect((await request.get('/games?when=someday')).status()).toBe(400);
  });

  test('the "next 7 days" count ignores the When filter, for the banner', async ({ request }) => {
    const t = tag();
    await createGame(request, newUser('host'), { title: `${t} a`, startsAt: inHours(5) });
    await createGame(request, newUser('host'), { title: `${t} b`, startsAt: inHours(24 * 9) });
    const body = await (await request.get(`/games?q=${t}&when=today`)).json();
    expect(body.inNext7Days).toBe(1);
  });
});
