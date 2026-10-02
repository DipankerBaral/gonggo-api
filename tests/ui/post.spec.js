const { test, expect, signInAs, uniqueTitle } = require('./fixtures');

// A datetime-local value for 3 days from now at 6:30pm
function inThreeDays() {
  const d = new Date(Date.now() + 3 * 864e5);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T18:30`;
}

async function fillForm(page, title) {
  await page.getByLabel("What's the game?").fill(title);
  await page.getByLabel('Sport').selectOption('basketball');
  await page.getByLabel('Players').fill('10');
  await page.getByLabel('When').fill(inThreeDays());
  await page.getByLabel('Place name').fill('Beaton Park');
  await page.locator('#pick-map').click(); // drops a pin in the middle of Wollongong
  await expect(page.getByText('Pin dropped')).toBeVisible();
}

test.describe('Posting a game', () => {
  test('posts a game and opens it', async ({ page }) => {
    await signInAs(page, 'Alex');
    const title = uniqueTitle('Friday hoops');

    await page.goto('/');
    await page.getByRole('link', { name: 'Post a game' }).click();
    await expect(page.getByRole('heading', { name: 'Post a game' })).toBeVisible();

    await fillForm(page, title);
    await page.getByRole('button', { name: 'Post game' }).click();

    await expect(page.getByRole('status')).toHaveText('Game posted.');
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("You're hosting.")).toBeVisible();
    await expect(page.getByTestId('spots-left')).toHaveText('9 spots left');
  });

  test('asks for a pin before posting', async ({ page }) => {
    await signInAs(page, 'Alex');
    await page.goto('/#/new');
    await page.getByLabel("What's the game?").fill(uniqueTitle('No pin'));
    await page.getByLabel('When').fill(inThreeDays());
    await page.getByLabel('Place name').fill('Somewhere');
    await page.getByRole('button', { name: 'Post game' }).click();

    await expect(page.getByRole('alert')).toContainText('Tap the map to show where to meet');
  });

  test('explains the one-game rule and links to your current game', async ({ page }) => {
    await signInAs(page, 'Busy');
    await page.goto('/#/new');
    await fillForm(page, uniqueTitle('First'));
    await page.getByRole('button', { name: 'Post game' }).click();
    await expect(page.getByRole('status')).toHaveText('Game posted.');

    await page.goto('/#/new');
    await fillForm(page, uniqueTitle('Second'));
    await page.getByRole('button', { name: 'Post game' }).click();

    await expect(page.getByRole('alert')).toContainText('You already have an active game');
    await expect(page.getByRole('link', { name: 'See your current game' })).toBeVisible();
  });
});
