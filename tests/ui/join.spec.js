const { test, expect, signInAs, uniqueTitle, newUser, createGame } = require('./fixtures');

test.describe('Joining a game', () => {
  test('a signed-out visitor is asked to sign in, then joins', async ({ page, request }) => {
    const game = await createGame(request, newUser('host'), { title: uniqueTitle('Touch footy'), capacity: 6 });

    await page.goto(`/#/game/${game.id}`);
    await page.getByRole('button', { name: 'Join game' }).click();

    const dialog = page.getByRole('dialog', { name: 'Sign in to join this game' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('First name').fill('Jordan');
    await dialog.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('status')).toHaveText("You're in.");
    await expect(page.getByTestId('players')).toContainText('Jordan (you)');
    await expect(page.getByTestId('spots-left')).toHaveText('4 spots left');
    await expect(page.getByRole('button', { name: 'Leave game' })).toBeVisible();

    // Signed in now: the top bar shows their name, and My games has the game
    await page.getByRole('button', { name: 'Jordan' }).click();
    await page.getByRole('link', { name: 'My games' }).click();
    await expect(page.getByText('Playing as Jordan')).toBeVisible();
    await expect(page.getByTestId('upcoming-games')).toContainText(game.title);
  });

  test('a name needs at least one letter', async ({ page, request }) => {
    const game = await createGame(request, newUser('host'), { title: uniqueTitle('Name check'), capacity: 6 });

    await page.goto(`/#/game/${game.id}`);
    await page.getByRole('button', { name: 'Join game' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('First name').fill('4333333333');
    await dialog.getByRole('button', { name: 'Sign in' }).click();

    await expect(dialog.getByText('Use letters, like Sam or Priya.')).toBeVisible();
    await expect(dialog.getByLabel('First name')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('spots-left')).toHaveText('5 spots left'); // nobody joined

    await dialog.getByLabel('First name').fill('Sam');
    await dialog.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('status')).toHaveText("You're in.");
  });

  test('choosing "Not now" leaves the game untouched', async ({ page, request }) => {
    const game = await createGame(request, newUser('host'), { title: uniqueTitle('Hit up'), capacity: 4 });

    await page.goto(`/#/game/${game.id}`);
    await page.getByRole('button', { name: 'Join game' }).click();
    await page.getByRole('button', { name: 'Not now' }).click();

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('spots-left')).toHaveText('3 spots left');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible(); // still signed out
  });

  test('leaving gives the spot back', async ({ page, request }) => {
    const game = await createGame(request, newUser('host'), { title: uniqueTitle('Tennis'), capacity: 4 });
    await signInAs(page, 'Priya');

    await page.goto(`/#/game/${game.id}`);
    await page.getByRole('button', { name: 'Join game' }).click();
    await expect(page.getByTestId('spots-left')).toHaveText('2 spots left');

    await page.getByRole('button', { name: 'Leave game' }).click();
    await expect(page.getByRole('status')).toHaveText("You've left the game.");
    await expect(page.getByTestId('spots-left')).toHaveText('3 spots left');
    await expect(page.getByRole('button', { name: 'Join game' })).toBeVisible();
  });

  test('a full game cannot be joined', async ({ page, request }) => {
    const game = await createGame(request, newUser('host'), { title: uniqueTitle('Singles'), capacity: 2 });
    await request.post(`/games/${game.id}/join`, { headers: { 'x-user-id': newUser('p') } });
    await signInAs(page, 'Late');

    await page.goto(`/#/game/${game.id}`);
    await expect(page.getByTestId('spots-left')).toHaveText('Full');
    await expect(page.getByRole('button', { name: 'Game full' })).toBeDisabled();
  });

  test('the host can cancel their game', async ({ page }) => {
    const host = await signInAs(page, 'Hosty');
    // Create the game as this browser's user, via the API
    const res = await page.request.post('/games', {
      headers: { 'x-user-id': host.id },
      data: {
        title: uniqueTitle('Cancel me'), sport: 'soccer', capacity: 6,
        startsAt: new Date(Date.now() + 3 * 864e5).toISOString(),
        location: { name: 'Stuart Park', lat: -34.4128, lng: 150.8975 },
      },
    });
    const game = await res.json();

    await page.goto(`/#/game/${game.id}`);
    await expect(page.getByRole('link', { name: 'Edit game' })).toBeVisible(); // hosts get Edit and Cancel
    page.once('dialog', (d) => d.accept()); // the "are you sure?" confirm
    await page.getByRole('button', { name: 'Cancel game' }).click();
    await expect(page.getByText('This game was cancelled.')).toBeVisible();
  });
});
