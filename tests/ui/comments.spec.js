const { test, expect, signInAs, uniqueTitle, newUser, createGame } = require('./fixtures');

// A game this browser's user has joined
async function joinedGame(page, request, name = 'Chatty') {
  const me = await signInAs(page, name);
  const host = newUser('host');
  const game = await createGame(request, host, { title: uniqueTitle('Chat game') });
  await page.request.post(`/games/${game.id}/join`, { headers: { 'x-user-id': me.id, 'x-user-name': name } });
  return { me, host, game };
}

test.describe('Comments', () => {
  test('a player can post a comment and see it', async ({ page, request }) => {
    const { game } = await joinedGame(page, request);
    await page.goto(`/#/game/${game.id}`);

    await expect(page.getByText('No comments yet. Ask a question or say hi.')).toBeVisible();
    await page.getByLabel('Write a comment').fill('Running 5 minutes late!');
    await page.getByRole('button', { name: 'Post comment' }).click();

    await expect(page.getByRole('status')).toHaveText('Comment posted.');
    const comment = page.getByTestId('comments').getByRole('listitem').first();
    await expect(comment).toContainText('Running 5 minutes late!');
    await expect(comment).toContainText('Chatty (you)');
    await expect(comment).toContainText('just now');
  });

  test("the host's comments are labelled", async ({ page, request }) => {
    const { host, game } = await joinedGame(page, request);
    await request.post(`/games/${game.id}/comments`, { headers: { 'x-user-id': host }, data: { body: 'Bring water' } });

    await page.goto(`/#/game/${game.id}`);
    const comment = page.getByTestId('comments').getByRole('listitem').filter({ hasText: 'Bring water' });
    await expect(comment).toContainText('host');
    await expect(comment.getByRole('button', { name: 'Delete' })).toHaveCount(0); // not mine to delete
  });

  test('I can delete my own comment', async ({ page, request }) => {
    const { me, game } = await joinedGame(page, request);
    await page.request.post(`/games/${game.id}/comments`, { headers: { 'x-user-id': me.id }, data: { body: 'Wrong game, sorry' } });

    await page.goto(`/#/game/${game.id}`);
    page.once('dialog', (d) => d.accept()); // "Delete this comment?"
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('status')).toHaveText('Comment deleted.');
    await expect(page.getByText('Wrong game, sorry')).toBeHidden();
  });

  test('comments are shown as text, never run as code', async ({ page, request }) => {
    const { me, game } = await joinedGame(page, request);
    const evil = '<img src=x onerror="window.hacked=1">';
    await page.request.post(`/games/${game.id}/comments`, { headers: { 'x-user-id': me.id }, data: { body: evil } });

    await page.goto(`/#/game/${game.id}`);
    await expect(page.getByTestId('comments')).toContainText(evil);
    expect(await page.evaluate(() => window.hacked)).toBeUndefined();
  });

  test('people not in the game cannot see the comments', async ({ page, request }) => {
    await signInAs(page, 'Nosy');
    const host = newUser('host');
    const game = await createGame(request, host, { title: uniqueTitle('Private chat') });
    await request.post(`/games/${game.id}/comments`, { headers: { 'x-user-id': host }, data: { body: 'Secret plans' } });

    await page.goto(`/#/game/${game.id}`);
    await expect(page.getByTestId('comments-locked')).toBeVisible();
    await expect(page.getByText('Secret plans')).toHaveCount(0);
  });

  test('joining opens up the comments', async ({ page, request }) => {
    await signInAs(page, 'Newbie');
    const game = await createGame(request, newUser('host'), { title: uniqueTitle('Join to chat') });

    await page.goto(`/#/game/${game.id}`);
    await page.getByRole('button', { name: 'Join game' }).click();
    await expect(page.getByLabel('Write a comment')).toBeVisible();
  });
});
