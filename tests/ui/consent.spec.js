const AxeBuilder = require('@axe-core/playwright').default;
const { test, expect, completeWelcome, uniqueTitle, newUser, createGame } = require('./fixtures');

// Sign in the way a new person does on a laptop (dev mode): name first
async function newPersonSignsIn(page, name = 'Newbie') {
  await page.getByRole('button', { name: 'Sign in' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('First name').fill(name);
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  return page.getByRole('dialog', { name: 'Welcome to GongGo' });
}

const yearsAgo = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return d.toISOString().slice(0, 10); };

test.describe('Welcome: 18+ and the terms', () => {
  test('a new person is asked for their date of birth and to accept the terms', async ({ page, request }) => {
    const game = await createGame(request, newUser('host'), { title: uniqueTitle('First game') });
    await page.goto(`/#/game/${game.id}`);
    await page.getByRole('button', { name: 'Join game' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('First name').fill('Ruby');
    await dialog.getByRole('button', { name: 'Sign in' }).click();

    const welcome = page.getByRole('dialog', { name: 'Welcome to GongGo' });
    await expect(welcome.getByLabel('First name')).toHaveValue('Ruby'); // carried over
    await expect(welcome.getByText('We check this, then forget the date.')).toBeVisible();
    await completeWelcome(page);

    await expect(welcome).toBeHidden();
    await expect(page.getByRole('status')).toHaveText("You're in.");
  });

  test('both a date of birth and ticking the box are required', async ({ page }) => {
    await page.goto('/');
    const welcome = await newPersonSignsIn(page);
    await welcome.getByRole('button', { name: 'Continue' }).click();
    await expect(welcome.getByText('Enter your date of birth.')).toBeVisible();
    await expect(welcome.getByText('Tick this to continue.')).toBeVisible();

    await welcome.getByLabel('Date of birth').fill('1995-06-15');
    await welcome.getByRole('button', { name: 'Continue' }).click();
    await expect(welcome.getByText('Tick this to continue.')).toBeVisible();
    await expect(welcome).toBeVisible();
  });

  test('someone under 18 is turned away and can sign out', async ({ page }) => {
    await page.goto('/');
    const welcome = await newPersonSignsIn(page, 'Kid');
    await completeWelcome(page, { dateOfBirth: yearsAgo(16) });

    await expect(welcome.getByRole('alert')).toContainText('GongGo is for people aged 18 and over');
    await expect(welcome.getByRole('button', { name: 'Continue' })).toBeHidden();
    await welcome.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('someone under 18 still cannot post, even going straight to the form', async ({ page }) => {
    await page.goto('/');
    await newPersonSignsIn(page, 'Teen');
    await completeWelcome(page, { dateOfBirth: yearsAgo(15) });
    await page.keyboard.press('Escape'); // close the dialog without signing out

    await page.goto('/#/new');
    await expect(page.getByRole('heading', { name: 'Finish setting up your account' })).toBeVisible();
  });

  test('the date of birth never reaches browser storage', async ({ page }) => {
    await page.goto('/');
    await newPersonSignsIn(page, 'Private');
    await completeWelcome(page, { dateOfBirth: '1988-11-23' });
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(stored).not.toContain('1988');
  });

  test('the welcome dialog passes accessibility checks', async ({ page }) => {
    await page.goto('/');
    await newPersonSignsIn(page);
    const results = await new AxeBuilder({ page }).include('#welcome-dialog').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

test.describe('Terms of Use and Privacy Policy', () => {
  test('the footer links to both', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('contentinfo').getByRole('link', { name: 'Terms of Use' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of Use' })).toBeVisible();
    await expect(page.getByText('You must be 18 or over')).toBeVisible();
    await page.getByRole('link', { name: 'Privacy Policy' }).last().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
  });

  test('the welcome dialog links open the pages in a new tab', async ({ page, context }) => {
    await page.goto('/');
    const welcome = await newPersonSignsIn(page);
    const [tab] = await Promise.all([context.waitForEvent('page'), welcome.getByRole('link', { name: 'Terms of Use' }).click()]);
    await tab.waitForLoadState();
    await expect(tab.getByRole('heading', { level: 1, name: 'Terms of Use' })).toBeVisible();
    await expect(welcome).toBeVisible(); // the sign-up is still waiting in the first tab
  });

  for (const page of ['terms', 'privacy']) {
    test(`the ${page} page passes accessibility checks`, async ({ page: browser }) => {
      await browser.goto(`/${page}.html`);
      const results = await new AxeBuilder({ page: browser }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }
});
