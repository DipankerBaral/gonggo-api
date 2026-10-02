const { test, expect } = require('@playwright/test');
const { newUser, asUser, validGame, createGame } = require('./helpers');

// Each test uses a brand-new person, so their limits start fresh.
test.describe('Rate limits', () => {
  test('one person can make 10 post attempts an hour, then gets 429', async ({ request }) => {
    const person = asUser(newUser('busy'));
    for (let i = 0; i < 10; i++) {
      const res = await request.post('/games', { headers: person, data: validGame() });
      expect(res.status()).not.toBe(429); // 201 for the first two, then 409 (the 2-game rule)
    }
    const res = await request.post('/games', { headers: person, data: validGame() });
    expect(res.status()).toBe(429);
    expect(res.headers()['retry-after']).toBeTruthy();
    expect((await res.json()).error).toContain('Try again in a few minutes');
  });

  test('one person can post 20 comments in 10 minutes', async ({ request }) => {
    const host = newUser('host');
    const game = await createGame(request, host);
    const url = `/games/${game.id}/comments`;
    for (let i = 0; i < 20; i++) {
      expect((await request.post(url, { headers: asUser(host), data: { body: `message ${i}` } })).status()).toBe(201);
    }
    expect((await request.post(url, { headers: asUser(host), data: { body: 'one more' } })).status()).toBe(429);
  });

  test("one person's limit doesn't affect anyone else", async ({ request }) => {
    const spammer = asUser(newUser('spam'));
    for (let i = 0; i < 11; i++) await request.post('/games', { headers: spammer, data: validGame() });
    const res = await request.post('/games', { headers: asUser(newUser('innocent')), data: validGame() });
    expect(res.status()).toBe(201);
  });
});
