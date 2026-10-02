const { test, expect, uniqueTitle, newUser, createGame } = require('./fixtures');

const inHours = (h) => new Date(Date.now() + h * 3600e3).toISOString();

test.describe('Home page', () => {
  test('the banner counts the games in the next 7 days', async ({ page, request }) => {
    await createGame(request, newUser('host'), { title: uniqueTitle('Counted'), startsAt: inHours(30) });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Find a game around the Gong' })).toBeVisible();
    await expect(page.locator('#hero-count')).toContainText(/\d+ games? in the next 7 days/);
  });

  test('games that are on right now come first, under "Happening now"', async ({ page, request }) => {
    const title = uniqueTitle('Live now');
    await createGame(request, newUser('host'), { title, startsAt: new Date(Date.now() + 1500).toISOString(), durationMinutes: 30 });
    await page.waitForTimeout(2000);
    await page.goto('/');
    const firstHeading = page.locator('#list-body h2').first();
    await expect(firstHeading).toHaveText('Happening now');
    await expect(page.locator('#list-body .games').first().getByTestId('game-row').filter({ hasText: title })).toBeVisible();
  });

  test('"When" narrows the list to a time', async ({ page, request }) => {
    const soon = uniqueTitle('In an hour');
    const later = uniqueTitle('In ten days');
    await createGame(request, newUser('host'), { title: soon, startsAt: inHours(1) });
    await createGame(request, newUser('host'), { title: later, startsAt: inHours(240) });

    await page.goto('/');
    await expect(page.getByText(later)).toBeVisible();
    await page.getByRole('toolbar', { name: 'When' }).getByRole('button', { name: 'This week' }).click();
    await expect(page.getByRole('button', { name: 'This week' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(soon)).toBeVisible();
    await expect(page.getByText(later)).toBeHidden();

    await page.getByRole('button', { name: 'Any time' }).click();
    await expect(page.getByText(later)).toBeVisible();
  });

  test('every sport filter has an icon, hidden from screen readers', async ({ page }) => {
    await page.goto('/');
    const soccer = page.getByRole('button', { name: 'Soccer', exact: true });
    await expect(soccer.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  test('on a computer, the map sits beside the list and follows the pointer', async ({ page, request, isMobile }) => {
    test.skip(isMobile, 'Phones show the list and map separately');
    const title = uniqueTitle('Hover me');
    const location = { name: 'Hover park', lat: -34.36 - Math.random() * 0.1, lng: 150.86 + Math.random() * 0.04 };
    await createGame(request, newUser('host'), { title, location });

    await page.goto('/');
    const pin = page.locator(`.map-pane .leaflet-marker-icon[title="${title}"]`);
    await expect(pin).toBeAttached();
    await page.getByTestId('game-row').filter({ hasText: title }).hover();
    await expect(pin).toHaveClass(/pin-active/);
  });

  test('on a phone there is no side map', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Phones only');
    await page.goto('/');
    await expect(page.locator('.map-pane')).toBeHidden();
    await expect(page.locator('#side-map .leaflet-container, #side-map.leaflet-container')).toHaveCount(0);
  });
});
