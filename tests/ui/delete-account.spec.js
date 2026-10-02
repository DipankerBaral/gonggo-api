const { test, expect, signInAs, uniqueTitle } = require('./fixtures');

test.describe('Deleting my account', () => {
  test('needs "delete" typed to confirm, then signs me out', async ({ page }) => {
    const me = await signInAs(page, 'Leaver');
    const title = uniqueTitle('Goodbye game');
    const res = await page.request.post('/games', {
      headers: { 'x-user-id': me.id, 'x-dev-consent': 'yes' },
      data: { title, sport: 'tennis', capacity: 4, startsAt: new Date(Date.now() + 3 * 864e5).toISOString(),
        location: { name: 'Fairy Meadow', lat: -34.39, lng: 150.9 } },
    });
    const game = await res.json();

    await page.goto('/#/me');
    await page.getByRole('button', { name: 'Delete my account' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete your account?' });
    const confirm = dialog.getByRole('button', { name: 'Delete my account' });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('Type delete to confirm').fill('delete');
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByRole('status')).toHaveText('Your account was deleted.');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    expect((await page.request.get(`/games/${game.id}`)).status()).toBe(404);
  });

  test('"Keep my account" changes nothing', async ({ page }) => {
    await signInAs(page, 'Stayer');
    await page.goto('/#/me');
    await page.getByRole('button', { name: 'Delete my account' }).click();
    await page.getByRole('button', { name: 'Keep my account' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByText('Playing as Stayer')).toBeVisible();
  });
});
