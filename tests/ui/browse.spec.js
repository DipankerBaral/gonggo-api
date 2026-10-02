const { test, expect, uniqueTitle, newUser, createGame } = require('./fixtures');

test.describe('Browsing games', () => {
  test('shows an upcoming game with its spots left', async ({ page, request }) => {
    const title = uniqueTitle('Beach volleyball');
    await createGame(request, newUser('host'), { title, sport: 'volleyball', capacity: 8 });

    await page.goto('/');
    const row = page.getByTestId('game-row').filter({ hasText: title });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Volleyball');
    await expect(row.getByTestId('spots-left')).toHaveText('7 spots left');
  });

  test('warns when only the last spots are left', async ({ page, request }) => {
    const title = uniqueTitle('Doubles');
    const game = await createGame(request, newUser('host'), { title, capacity: 3 });
    await request.post(`/games/${game.id}/join`, { headers: { 'x-user-id': newUser('p') } });

    await page.goto('/');
    const spots = page.getByTestId('game-row').filter({ hasText: title }).getByTestId('spots-left');
    await expect(spots).toHaveText('1 spot left');
    await expect(spots).toHaveClass(/last/);
  });

  test('filters by sport', async ({ page, request }) => {
    const hoops = uniqueTitle('Hoops');
    const run = uniqueTitle('Run club');
    await createGame(request, newUser('host'), { title: hoops, sport: 'basketball' });
    await createGame(request, newUser('host'), { title: run, sport: 'running' });

    await page.goto('/');
    await expect(page.getByText(run)).toBeVisible();

    await page.getByRole('button', { name: 'Basketball' }).click();
    await expect(page.getByRole('button', { name: 'Basketball' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(hoops)).toBeVisible();
    await expect(page.getByText(run)).toBeHidden();
  });

  test('opens a game to see who is coming', async ({ page, request }) => {
    const title = uniqueTitle('Futsal');
    await createGame(request, newUser('sam'), { title, description: 'Bring indoor shoes.' });

    await page.goto('/');
    await page.getByText(title).click();

    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText('Bring indoor shoes.')).toBeVisible();
    await expect(page.getByTestId('players')).toContainText('Sam');
    await expect(page.getByTestId('players')).toContainText('host');
  });

  test('shows games as pins on the map', async ({ page, request }) => {
    const title = uniqueTitle('Cricket nets');
    // Its own spot on the map: other tests' games all sit at the same park,
    // and pins at the same place overlap (a real UX issue to solve later)
    const location = { name: 'Nets', lat: -34.36 - Math.random() * 0.1, lng: 150.85 + Math.random() * 0.05 };
    await createGame(request, newUser('host'), { title, sport: 'cricket', location });

    await page.goto('/#/map');
    const pin = page.locator(`.leaflet-marker-icon[title="${title}"]`);
    await expect(pin).toBeVisible();
    await pin.click();
    await page.locator('.leaflet-popup').getByRole('link', { name: 'View game' }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  });

  test('user-entered text is shown as text, never run as code', async ({ page, request }) => {
    const title = `<img src=x onerror="window.hacked=1"> ${uniqueTitle('xss')}`;
    await createGame(request, newUser('host'), { title });

    await page.goto('/');
    await expect(page.getByText(title)).toBeVisible();
    expect(await page.evaluate(() => window.hacked)).toBeUndefined();
  });

  test('an unknown game shows a helpful message', async ({ page }) => {
    await page.goto('/#/game/not-a-real-game');
    await expect(page.getByRole('heading', { name: "This game isn't available" })).toBeVisible();
    await expect(page.getByRole('link', { name: 'See other games' })).toBeVisible();
  });
});
