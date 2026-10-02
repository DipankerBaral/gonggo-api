const { test, expect } = require('@playwright/test');
const { newUser, asUser, createGame } = require('./helpers');

test.describe('Profile (/me)', () => {
  test('requires sign-in', async ({ request }) => {
    expect((await request.get('/me')).status()).toBe(401);
    expect((await request.patch('/me', { data: { name: 'Sam' } })).status()).toBe(401);
  });

  test('a new person starts with the name from their sign-in', async ({ request }) => {
    const id = newUser('fresh');
    const me = await (await request.get('/me', { headers: asUser(id, 'Mia') })).json();
    expect(me).toMatchObject({ id, name: 'Mia' });
  });

  test('a person can choose a name, and a later sign-in does not overwrite it', async ({ request }) => {
    const id = newUser('namer');
    await request.get('/me', { headers: asUser(id, 'Original') });
    const res = await request.patch('/me', { headers: asUser(id), data: { name: '  Jordan ' } });
    expect(res.status()).toBe(200);
    expect((await res.json()).name).toBe('Jordan');

    const again = await (await request.get('/me', { headers: asUser(id, 'Original') })).json();
    expect(again.name).toBe('Jordan');
  });

  test('someone first seen without a name gets one from a later sign-in', async ({ request }) => {
    const id = newUser('late');
    await request.get('/me', { headers: asUser(id) }); // no name yet
    const me = await (await request.get('/me', { headers: asUser(id, 'Ava') })).json();
    expect(me.name).toBe('Ava');
  });

  for (const [label, name] of [['only numbers', '4333333333'], ['empty', '   '], ['too long', 'x'.repeat(31)]]) {
    test(`rejects a name that is ${label}`, async ({ request }) => {
      const res = await request.patch('/me', { headers: asUser(newUser()), data: { name } });
      expect(res.status()).toBe(400);
    });
  }

  test('game pages show players by their chosen names', async ({ request }) => {
    const host = newUser('host');
    const player = newUser('player');
    const game = await createGame(request, host);
    await request.patch('/me', { headers: asUser(host), data: { name: 'Hana' } });
    await request.patch('/me', { headers: asUser(player), data: { name: 'Raj' } });
    await request.post(`/games/${game.id}/join`, { headers: asUser(player) });

    const detail = await (await request.get(`/games/${game.id}`)).json();
    expect(detail.players).toEqual([{ id: host, name: 'Hana' }, { id: player, name: 'Raj' }]);
  });

  test('the browser can fetch sign-in settings, with no secrets in them', async ({ request }) => {
    const body = await (await request.get('/config')).json();
    expect(['dev', 'cognito']).toContain(body.auth.mode);
    expect(JSON.stringify(body)).not.toMatch(/secret|password|private/i);
  });
});
