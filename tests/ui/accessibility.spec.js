const AxeBuilder = require('@axe-core/playwright').default;
const { test, expect, uniqueTitle, newUser, createGame } = require('./fixtures');

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

  test('post form', async ({ page }) => {
    await page.goto('/#/new');
    await expect(page.getByRole('heading', { name: 'Post a game' })).toBeVisible();
    await expectNoViolations(page);
  });
});
