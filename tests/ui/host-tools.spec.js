const { test, expect, signInAs, uniqueTitle, newUser, createGame } = require('./fixtures');

const soon = (seconds) => new Date(Date.now() + seconds * 1000).toISOString();

// A game hosted by this browser's user
async function hostedGame(page, overrides = {}) {
  const host = await signInAs(page, 'Hostess');
  const res = await page.request.post('/games', {
    headers: { 'x-user-id': host.id, 'x-dev-consent': 'yes', 'x-user-name': 'Hostess' },
    data: {
      title: uniqueTitle('Hosted'), sport: 'soccer', capacity: 8, durationMinutes: 90,
      startsAt: new Date(Date.now() + 3 * 864e5).toISOString(),
      location: { name: 'Stuart Park', lat: -34.4128, lng: 150.8975 },
      ...overrides,
    },
  });
  return { host, game: await res.json() };
}

test.describe('Host tools', () => {
  test('the game page shows when it starts and ends', async ({ page }) => {
    const { game } = await hostedGame(page, { durationMinutes: 120 });
    await page.goto(`/#/game/${game.id}`);
    await expect(page.getByTestId('when')).toContainText(' to ');
  });

  test('the host can edit a game, and everyone keeps their spot', async ({ page, request }) => {
    const { game } = await hostedGame(page);
    await request.post(`/games/${game.id}/join`, { headers: { 'x-user-id': newUser('keeper'), 'x-dev-consent': 'yes' } });

    await page.goto(`/#/game/${game.id}`);
    await page.getByRole('link', { name: 'Edit game' }).click();
    await expect(page.getByRole('heading', { name: 'Edit game' })).toBeVisible();
    await expect(page.getByLabel("What's the game?")).toHaveValue(game.title); // filled in already

    const newTitle = uniqueTitle('Moved indoors');
    await page.getByLabel("What's the game?").fill(newTitle);
    await page.getByLabel('Place name').fill('Beaton Park Leisure Centre');
    await page.getByLabel('How long').selectOption('120');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByRole('status')).toHaveText('Changes saved.');
    await expect(page.getByRole('heading', { level: 1, name: newTitle })).toBeVisible();
    await expect(page.getByText('Beaton Park Leisure Centre')).toBeVisible();
    await expect(page.getByTestId('when')).toContainText('details updated');
    await expect(page.getByTestId('spots-left')).toHaveText('6 spots left');
  });

  test("people who aren't the host can't open the edit page", async ({ page, request }) => {
    await signInAs(page, 'Nosy');
    const game = await createGame(request, newUser('host'));
    await page.goto(`/#/game/${game.id}/edit`);
    await expect(page.getByRole('heading', { name: "You can't edit this game" })).toBeVisible();
  });

  test('the host can remove a player', async ({ page, request }) => {
    const { game } = await hostedGame(page);
    const trouble = newUser('trouble');
    await request.patch('/me', { headers: { 'x-user-id': trouble, 'x-dev-consent': 'yes' }, data: { name: 'Trouble' } });
    await request.post(`/games/${game.id}/join`, { headers: { 'x-user-id': trouble, 'x-dev-consent': 'yes' } });

    await page.goto(`/#/game/${game.id}`);
    page.once('dialog', (d) => d.accept()); // "Remove Trouble from this game?"
    await page.getByRole('button', { name: 'Remove Trouble' }).click();

    await expect(page.getByRole('status')).toHaveText('Trouble was removed.');
    await expect(page.getByTestId('players')).not.toContainText('Trouble');
    await expect(page.getByTestId('spots-left')).toHaveText('7 spots left');
  });

  test('players do not see remove buttons', async ({ page, request }) => {
    const me = await signInAs(page, 'Regular');
    const game = await createGame(request, newUser('host'));
    await page.request.post(`/games/${game.id}/join`, { headers: { 'x-user-id': me.id, 'x-dev-consent': 'yes' } });
    await page.goto(`/#/game/${game.id}`);
    await expect(page.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
  });

  test('a game that has started shows "On now" and can still be joined', async ({ page, request }) => {
    await signInAs(page, 'Latecomer');
    const title = uniqueTitle('Kicked off');
    const game = await createGame(request, newUser('host'), { title, startsAt: soon(2), durationMinutes: 30 });
    await page.waitForTimeout(2500);

    await page.goto('/');
    await expect(page.getByTestId('game-row').filter({ hasText: title })).toContainText('On now');
    await page.goto(`/#/game/${game.id}`);
    await expect(page.getByText('Running late? You can still join.')).toBeVisible();
    await page.getByRole('button', { name: 'Join game' }).click();
    await expect(page.getByRole('status')).toHaveText("You're in.");
  });

  test('sharing copies a link to the game', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Clipboard permissions are Chromium-only here');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const { game } = await hostedGame(page);
    await page.goto(`/#/game/${game.id}`);
    await page.evaluate(() => { delete Navigator.prototype.share; }); // force the copy-link path
    await page.getByRole('button', { name: 'Share game' }).click();

    await expect(page.getByRole('status')).toHaveText('Link copied. Paste it anywhere to share.');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain(`/#/game/${game.id}`);
    expect(copied).toContain(game.title);
  });
});
