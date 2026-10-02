const AxeBuilder = require('@axe-core/playwright').default;
const { test, expect, signInAs } = require('./fixtures');

test.describe('Account menu', () => {
  test('signed out, the top bar offers Sign in', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.locator('#account')).toBeHidden();
  });

  test('signed in, the top bar shows my name and opens a menu', async ({ page }) => {
    await signInAs(page, 'Dipan');
    await page.goto('/');

    const button = page.getByRole('button', { name: 'Dipan' });
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');

    const menu = page.locator('#account-menu');
    await expect(menu.getByRole('link', { name: 'My games' })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Change name' })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'My games' })).toBeFocused(); // keyboard users land in the menu
  });

  test('Escape closes the menu and returns focus to the button', async ({ page }) => {
    await signInAs(page, 'Keys');
    await page.goto('/');
    await page.getByRole('button', { name: 'Keys' }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#account-menu')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Keys' })).toBeFocused();
  });

  test('clicking elsewhere closes the menu', async ({ page }) => {
    await signInAs(page, 'Clicker');
    await page.goto('/');
    await page.getByRole('button', { name: 'Clicker' }).click();
    await page.locator('main').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#account-menu')).toBeHidden();
  });

  test('My games opens from the menu', async ({ page }) => {
    await signInAs(page, 'Mover');
    await page.goto('/');
    await page.getByRole('button', { name: 'Mover' }).click();
    await page.getByRole('link', { name: 'My games' }).click();
    await expect(page.getByRole('heading', { name: 'My games' })).toBeVisible();
    await expect(page.locator('#account-menu')).toBeHidden();
  });

  test('Sign out from the menu', async ({ page }) => {
    await signInAs(page, 'Bye');
    await page.goto('/#/me');
    await page.getByRole('button', { name: 'Bye' }).click();
    // The My games page has its own Sign out too; use the one in the menu
    await page.locator('#account-menu').getByRole('button', { name: 'Sign out' }).click();

    await expect(page.getByRole('status')).toHaveText('Signed out.');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page).toHaveURL(/#\/$/);
    expect(await page.evaluate(() => localStorage.getItem('gonggo:session'))).toBeNull();
  });

  test('Change name from the menu updates the top bar', async ({ page }) => {
    await signInAs(page, 'Before');
    await page.goto('/');
    await page.getByRole('button', { name: 'Before' }).click();
    await page.getByRole('button', { name: 'Change name' }).click();

    const dialog = page.getByRole('dialog', { name: 'What should other players call you?' });
    await expect(dialog.getByLabel('First name')).toHaveValue('Before');
    await dialog.getByLabel('First name').fill('After');
    await dialog.getByRole('button', { name: 'Save name' }).click();

    await expect(page.getByRole('status')).toHaveText('Name changed.');
    await expect(page.getByRole('button', { name: 'After' })).toBeVisible();
  });

  test('the open menu passes accessibility checks', async ({ page }) => {
    await signInAs(page, 'Ally');
    await page.goto('/#/me');
    await page.getByRole('button', { name: 'Ally' }).click();
    const results = await new AxeBuilder({ page }).include('header').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
