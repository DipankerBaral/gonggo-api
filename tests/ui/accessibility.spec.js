const AxeBuilder = require('@axe-core/playwright').default;
const { test, expect, signInAs, uniqueTitle, newUser, createGame } = require('./fixtures');

// Automated accessibility checks (WCAG 2.1 A and AA) on each main screen.
// They catch a good share of problems, like missing labels and low contrast,
// but not everything: manual checks with a keyboard and a screen reader still matter.
async function expectNoViolations(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.leaflet-container') // third-party map widget
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

test.describe('Accessibility', () => {
  // axe checks every element on the page. With hundreds of games in a long-lived
  // test database the list page takes ~30s to check, so allow more time.
  // (The real fix is paginating the list; see the README's "Known gaps".)
  test.setTimeout(60_000);

  test('game list', async ({ page, request }) => {
    await createGame(request, newUser('host'), { title: uniqueTitle('A11y list') });
    await page.goto('/');
    await expect(page.getByTestId('game-row').first()).toBeVisible();
    await expectNoViolations(page);
  });

  test('game page', async ({ page, request }) => {
    const game = await createGame(request, newUser('host'), { title: uniqueTitle('A11y game') });
    await page.goto(`/#/game/${game.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoViolations(page);
  });

  test('game page with comments, signed in', async ({ page, request }) => {
    const me = await signInAs(page, 'Ally');
    const game = await createGame(request, newUser('host'), { title: uniqueTitle('A11y comments') });
    await page.request.post(`/games/${game.id}/join`, { headers: { 'x-user-id': me.id } });
    await page.request.post(`/games/${game.id}/comments`, { headers: { 'x-user-id': me.id }, data: { body: 'See you there' } });
    await page.goto(`/#/game/${game.id}`);
    await expect(page.getByTestId('comments')).toBeVisible();
    await expectNoViolations(page);
  });

  test('sign-in dialog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoViolations(page);
  });

  test('post form', async ({ page }) => {
    await signInAs(page, 'Poster');
    await page.goto('/#/new');
    await expect(page.getByRole('heading', { name: 'Post a game' })).toBeVisible();
    await expectNoViolations(page);
  });
});
