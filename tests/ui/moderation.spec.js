const { test, expect, signInAs, uniqueTitle, newUser, createGame } = require('./fixtures');
const { asAdmin } = require('../helpers');

// A game with a comment from someone else, that this browser's user has joined
async function gameWithComment(page, request, body = 'Cheap watches at spam.example') {
  const me = await signInAs(page, 'Reporter');
  const spammer = newUser('spammer');
  await request.patch('/me', { headers: { 'x-user-id': spammer, 'x-dev-consent': 'yes' }, data: { name: 'Spammer' } });
  const game = await createGame(request, newUser('host'), { title: uniqueTitle('Moderated') });
  for (const id of [me.id, spammer]) await request.post(`/games/${game.id}/join`, { headers: { 'x-user-id': id, 'x-dev-consent': 'yes' } });
  const comment = await (await request.post(`/games/${game.id}/comments`, { headers: { 'x-user-id': spammer, 'x-dev-consent': 'yes' }, data: { body } })).json();
  return { me, spammer, game, comment };
}

test.describe('Reporting comments', () => {
  test("a player can report someone else's comment", async ({ page, request }) => {
    const { game } = await gameWithComment(page, request);
    await page.goto(`/#/game/${game.id}`);

    await page.getByRole('button', { name: 'Report comment by Spammer' }).click();
    const dialog = page.getByRole('dialog', { name: 'Report this comment' });
    await dialog.getByRole('button', { name: 'Send report' }).click();
    await expect(dialog.getByText('Add a few words')).toBeVisible(); // a reason is required
    await dialog.getByLabel("What's wrong with it?").fill('Spam link');
    await dialog.getByRole('button', { name: 'Send report' }).click();

    await expect(page.getByRole('status')).toHaveText('Report sent. Thanks for keeping GongGo friendly.');
  });

  test('there is no Report button on my own comments', async ({ page, request }) => {
    const { me, game } = await gameWithComment(page, request);
    await page.request.post(`/games/${game.id}/comments`, { headers: { 'x-user-id': me.id, 'x-dev-consent': 'yes' }, data: { body: 'My own note' } });
    await page.goto(`/#/game/${game.id}`);
    await expect(page.getByRole('button', { name: 'Report comment by Reporter' })).toHaveCount(0);
  });
});

test.describe('Admin page', () => {
  test('only admins see it', async ({ page }) => {
    await signInAs(page, 'Regular');
    await page.goto('/');
    await page.getByRole('button', { name: 'Regular' }).click();
    await expect(page.locator('#account-menu').getByRole('link', { name: 'Admin' })).toBeHidden();
    await page.goto('/#/admin');
    await expect(page.getByRole('heading', { name: 'Admins only' })).toBeVisible();
  });

  test('an admin can open it from the account menu', async ({ page }) => {
    await signInAs(page, 'Mod', { admin: true });
    await page.goto('/');
    await page.getByRole('button', { name: 'Mod' }).click();
    await page.locator('#account-menu').getByRole('link', { name: 'Admin' }).click();
    await expect(page.getByRole('heading', { name: 'Admin', exact: true })).toBeVisible();
  });

  test('an admin can delete a reported comment', async ({ page, request }) => {
    const { me, game, comment } = await gameWithComment(page, request, uniqueTitle('Spammy comment'));
    // The player reports it (through the API, to keep this test about the admin page)
    await request.post(`/games/${game.id}/comments/${comment.id}/report`, { headers: { 'x-user-id': me.id, 'x-dev-consent': 'yes' }, data: { reason: 'Spam link' } });

    await signInAs(page, 'Mod', { admin: true }); // now this browser is an admin
    await page.goto('/#/admin');
    const item = page.getByTestId('reported-comments').getByRole('listitem').filter({ hasText: comment.body });
    await expect(item).toContainText('Spam link');
    page.once('dialog', (d) => d.accept());
    await item.getByRole('button', { name: 'Delete comment' }).click();

    await expect(page.getByRole('status')).toHaveText('Comment deleted.');
    await expect(page.getByText(comment.body)).toHaveCount(0);
  });

  test('an admin can remove a reported game, giving a reason', async ({ page, request }) => {
    const title = uniqueTitle('Fake game');
    const game = await createGame(request, newUser('host'), { title });
    await request.post(`/games/${game.id}/report`, { headers: { 'x-user-id': newUser('r'), 'x-dev-consent': 'yes' }, data: { reason: 'Not a real event' } });

    await signInAs(page, 'Mod', { admin: true });
    await page.goto('/#/admin');
    const item = page.getByTestId('reported-games').getByRole('listitem').filter({ hasText: title });
    await item.getByRole('button', { name: 'Remove game' }).click();
    const dialog = page.getByRole('dialog', { name: 'Remove this game' });
    await dialog.getByLabel('Reason (kept for your records)').fill('Fake listing');
    await dialog.getByRole('button', { name: 'Remove game' }).click();

    await expect(page.getByRole('status')).toHaveText('Game removed.');
    expect((await request.get(`/games/${game.id}`)).status()).toBe(404);
  });

  test('an admin can ban and unban someone', async ({ page, request }) => {
    const title = uniqueTitle('Troll game');
    const troll = newUser('troll');
    await request.patch('/me', { headers: { 'x-user-id': troll, 'x-dev-consent': 'yes' }, data: { name: 'Troll' } });
    const game = await createGame(request, troll, { title });
    await request.post(`/games/${game.id}/report`, { headers: { 'x-user-id': newUser('r'), 'x-dev-consent': 'yes' }, data: { reason: 'Abusive' } });

    await signInAs(page, 'Mod', { admin: true });
    await page.goto('/#/admin');
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('reported-games').getByRole('listitem').filter({ hasText: title })
      .getByRole('button', { name: 'Ban Troll' }).click();
    await expect(page.getByRole('status')).toHaveText('Troll was banned.');

    const bannedRow = page.getByTestId('banned').getByRole('listitem').filter({ hasText: 'Troll' });
    await bannedRow.getByRole('button', { name: 'Unban' }).click();
    await expect(page.getByRole('status')).toHaveText('Troll was unbanned.');
    const banned = await (await request.get('/admin/banned', { headers: asAdmin() })).json();
    expect(banned.map((b) => b.userId)).not.toContain(troll);
  });
});
