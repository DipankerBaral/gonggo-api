const { test, expect, signInAs, completeWelcome, uniqueTitle } = require('./fixtures');

// A datetime-local value for 3 days from now at 6:30pm
function inThreeDays() {
  const d = new Date(Date.now() + 3 * 864e5);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T18:30`;
}

async function fillForm(page, title) {
  await page.getByLabel("What's the game?").fill(title);
  await page.getByLabel('Sport').selectOption('basketball');
  await page.getByLabel('Players', { exact: true }).fill('10');
  await page.getByLabel('When').fill(inThreeDays());
  await page.getByLabel('Place name').fill('Beaton Park');
  await page.locator('#pick-map').click(); // drops a pin in the middle of Wollongong
  await expect(page.getByText('Pin dropped')).toBeVisible();
}

test.describe('Posting a game', () => {
  test('signed-out visitors are asked to sign in first', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Post a game' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in to post a game' })).toBeVisible();
    await expect(page.getByLabel("What's the game?")).toHaveCount(0);

    await page.locator('#card-sign-in').click();
    const dialog = page.getByRole('dialog', { name: 'Sign in to post a game' });
    await dialog.getByLabel('First name').fill('Newhost');
    await dialog.getByRole('button', { name: 'Sign in' }).click();
    await completeWelcome(page);
    await expect(page.getByLabel("What's the game?")).toBeVisible(); // the form appears once signed in
  });

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
    await expect(page.getByRole('link', { name: 'Edit game' })).toBeVisible(); // hosts get Edit and Cancel
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

  test('allows two upcoming games, then explains the limit', async ({ page }) => {
    await signInAs(page, 'Busy');
    for (const label of ['First', 'Second']) {
      const title = uniqueTitle(label);
      await page.goto('/#/new');
      await fillForm(page, title);
      await page.getByRole('button', { name: 'Post game' }).click();
      // Wait for this game's own page. Not the "Game posted." message: the one
      // from the previous post can still be on screen, which made this flaky.
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    }

    await page.goto('/#/new');
    await fillForm(page, uniqueTitle('Third'));
    await page.getByRole('button', { name: 'Post game' }).click();

    await expect(page.getByRole('alert')).toContainText('You already have 2 upcoming games');
    await page.getByRole('link', { name: 'See my games' }).click();
    await expect(page.getByTestId('upcoming-games').getByText("You're hosting")).toHaveCount(2);
  });
});
