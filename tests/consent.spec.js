const { test, expect } = require('@playwright/test');
const { newUser, asUser, asNewUser, validGame, createGame } = require('./helpers');

// A date of birth that makes someone exactly `years` old today (in Wollongong),
// shifted by `dayOffset` days (+1 = their birthday is tomorrow)
function dobForAge(years, dayOffset = 0) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date()).split('-').map(Number);
  const date = new Date(Date.UTC(y - years, m - 1, d + dayOffset));
  return date.toISOString().slice(0, 10);
}

const consent = (request, id, data) => request.post('/me/consent', { headers: asNewUser(id), data });

test.describe('Age and terms', () => {
  test("someone new can't post, join or comment until they've confirmed", async ({ request }) => {
    const id = newUser('fresh');
    const game = await createGame(request, newUser('host'));

    for (const res of [
      await request.post('/games', { headers: asNewUser(id), data: validGame() }),
      await request.post(`/games/${game.id}/join`, { headers: asNewUser(id) }),
    ]) {
      expect(res.status()).toBe(403);
      expect((await res.json()).code).toBe('consent_required');
    }
  });

  test('they can still see their profile, which says they have not confirmed', async ({ request }) => {
    const me = await (await request.get('/me', { headers: asNewUser(newUser('fresh')) })).json();
    expect(me.consented).toBe(false);
    expect(me.termsVersion).toBeTruthy();
  });

  test('an adult who accepts the terms can then use GongGo', async ({ request }) => {
    const id = newUser('adult');
    const res = await consent(request, id, { dateOfBirth: dobForAge(30), acceptTerms: true });
    expect(res.status()).toBe(200);
    expect((await res.json()).consented).toBe(true);

    expect((await request.post('/games', { headers: asNewUser(id), data: validGame() })).status()).toBe(201);
  });

  test('someone turning 18 today is old enough', async ({ request }) => {
    expect((await consent(request, newUser('bday'), { dateOfBirth: dobForAge(18), acceptTerms: true })).status()).toBe(200);
  });

  test('someone turning 18 tomorrow is not', async ({ request }) => {
    const id = newUser('almost');
    const res = await consent(request, id, { dateOfBirth: dobForAge(18, 1), acceptTerms: true });
    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe('under_age');
    expect((await (await request.get('/me', { headers: asNewUser(id) })).json()).consented).toBe(false);
  });

  test('a 15-year-old is turned away and stays blocked', async ({ request }) => {
    const id = newUser('teen');
    expect((await consent(request, id, { dateOfBirth: dobForAge(15), acceptTerms: true })).status()).toBe(403);
    expect((await request.post('/games', { headers: asNewUser(id), data: validGame() })).status()).toBe(403);
  });

  test('the terms must be accepted, not just the age given', async ({ request }) => {
    expect((await consent(request, newUser('x'), { dateOfBirth: dobForAge(30) })).status()).toBe(400);
    expect((await consent(request, newUser('x'), { dateOfBirth: dobForAge(30), acceptTerms: 'yes' })).status()).toBe(400);
  });

  for (const [label, dateOfBirth] of [['not a date', 'last tuesday'], ['an impossible date', '1990-02-31'],
    ['in the future', dobForAge(-1)], ['over 120 years ago', '1850-01-01'], ['missing', undefined]]) {
    test(`rejects a date of birth that is ${label}`, async ({ request }) => {
      expect((await consent(request, newUser('x'), { dateOfBirth, acceptTerms: true })).status()).toBe(400);
    });
  }

  test('the date of birth is never sent back (it is not stored)', async ({ request }) => {
    const id = newUser('private');
    const res = await (await consent(request, id, { dateOfBirth: '1990-05-05', acceptTerms: true })).json();
    const me = await (await request.get('/me', { headers: asNewUser(id) })).json();
    expect(JSON.stringify(res) + JSON.stringify(me)).not.toContain('1990');
  });

  test('someone who has not confirmed can still delete their account', async ({ request }) => {
    const id = newUser('changed-mind');
    await request.get('/me', { headers: asNewUser(id) });
    expect((await request.delete('/me', { headers: asNewUser(id) })).status()).toBe(200);
  });

  test('existing tests sign in as people who already agreed', async ({ request }) => {
    const me = await (await request.get('/me', { headers: asUser(newUser('veteran')) })).json();
    expect(me.consented).toBe(true);
  });
});

test.describe('Working out ages', () => {
  const { ageOn } = require('../src/validation');
  test('counts birthdays correctly, including leap days', () => {
    const on = (iso) => new Date(`${iso}T02:00:00Z`); // midday in Sydney
    expect(ageOn('2000-10-02', on('2018-10-02'))).toBe(18);
    expect(ageOn('2000-10-03', on('2018-10-02'))).toBe(17);
    expect(ageOn('2000-02-29', on('2018-02-28'))).toBe(17);
    expect(ageOn('2000-02-29', on('2018-03-01'))).toBe(18);
    expect(ageOn('2001-02-29')).toBeNull(); // 2001 wasn't a leap year
  });
});
