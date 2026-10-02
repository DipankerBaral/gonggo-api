const { test, expect, uniqueTitle, newUser, createGame } = require('./fixtures');

test('a slow page does not draw over the page you moved to', async ({ page, request }) => {
  const game = await createGame(request, newUser('host'), { title: uniqueTitle('Slow game') });

  // Make loading this one game take 1.5 seconds, like a weak phone signal
  await page.route(`**/games/${game.id}`, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });

  await page.goto(`/#/game/${game.id}`);
  await page.goto('/#/new'); // move on before the game has loaded
  await expect(page.getByRole('heading', { name: 'Post a game' })).toBeVisible();

  await page.waitForTimeout(2000); // let the slow response arrive
  await expect(page.getByRole('heading', { name: 'Post a game' })).toBeVisible();
  await expect(page.getByText(game.title)).toBeHidden();
});
