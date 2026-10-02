const { test, expect, signInAs, uniqueTitle, newUser, createGame } = require('./fixtures');

const futureGame = (title) => ({
  title, sport: 'soccer', capacity: 8,
  startsAt: new Date(Date.now() + 3 * 864e5).toISOString(),
  location: { name: 'Stuart Park', lat: -34.4128, lng: 150.8975 },
});

test.describe('My games', () => {
  test('signed out, it asks you to sign in', async ({ page }) => {
    await page.goto('/#/me');
    await expect(page.getByRole('heading', { name: 'Sign in to see your games' })).toBeVisible();
    await page.locator('#card-sign-in').click();
    await expect(page.getByRole('dialog', { name: 'Sign in to see your games' })).toBeVisible();
  });

  test('signing out returns you to browsing', async ({ page }) => {
    await signInAs(page, 'Leaving');
    await page.goto('/#/me');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('status')).toHaveText('Signed out.');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'My games' })).toBeHidden();
  });

  test('shows games I host and games I joined', async ({ page, request }) => {
    const me = await signInAs(page, 'Kai');
    const hosting = uniqueTitle('My futsal');
    await page.request.post('/games', { headers: { 'x-user-id': me.id }, data: futureGame(hosting) });
    const joined = await createGame(request, newUser('host'), { title: uniqueTitle('Their run') });
    await page.request.post(`/games/${joined.id}/join`, { headers: { 'x-user-id': me.id } });

    await page.goto('/');
    await page.getByRole('button', { name: 'Kai' }).click();
    await page.getByRole('link', { name: 'My games' }).click();
    // The menu has closed, so check the link directly rather than by role
    await expect(page.locator('#account-menu a[data-view="me"]')).toHaveAttribute('aria-current', 'page');

    const upcoming = page.getByTestId('upcoming-games');
    await expect(upcoming.getByTestId('game-row').filter({ hasText: hosting })).toContainText("You're hosting");
    await expect(upcoming.getByTestId('game-row').filter({ hasText: joined.title })).toBeVisible();
    await expect(page.getByText('No games in the last 30 days.')).toBeVisible();
  });

  test('a cancelled game stays, marked cancelled', async ({ page, request }) => {
    const me = await signInAs(page, 'Lee');
    const host = newUser('host');
    const game = await createGame(request, host, { title: uniqueTitle('Rained out') });
    await page.request.post(`/games/${game.id}/join`, { headers: { 'x-user-id': me.id } });
    await request.delete(`/games/${game.id}`, { headers: { 'x-user-id': host } });

    await page.goto('/#/me');
    await expect(page.getByTestId('game-row').filter({ hasText: game.title })).toContainText('Cancelled');
  });

  test('changing my name keeps my games', async ({ page, request }) => {
    const me = await signInAs(page, 'Old');
    const game = await createGame(request, newUser('host'), { title: uniqueTitle('Keep me') });
    await page.request.post(`/games/${game.id}/join`, { headers: { 'x-user-id': me.id } });

    await page.goto('/#/me');
    await page.getByRole('button', { name: 'Change name' }).click();
    const dialog = page.getByRole('dialog', { name: 'What should other players call you?' });
    await dialog.getByLabel('First name').fill('Newname');
    await dialog.getByRole('button', { name: 'Save name' }).click();

    await expect(page.getByText('Playing as Newname')).toBeVisible();
    await expect(page.getByTestId('upcoming-games')).toContainText(game.title);
  });
});
