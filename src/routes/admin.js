const express = require('express');
const store = require('../store');
const { requireAdmin } = require('../middleware/auth');
const ah = require('../asyncHandler');
const { fallbackName } = require('../validation');

const router = express.Router();
router.use(requireAdmin);

// Everything, including cancelled, removed and unpaid tournaments
router.get('/games', ah(async (req, res) => {
  res.json(await store.listAllGamesWithReports());
}));

router.get('/reports', ah(async (req, res) => res.json(await store.listReports())));

router.post('/games/:id/remove', ah(async (req, res) => {
  const game = await store.getGame(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason) return res.status(400).json({ errors: ['reason is required'] });
  res.json(await store.setStatus(game.id, 'removed', reason));
}));

// Placeholder until Stripe: admin marks a tournament as paid and publishes it
router.post('/games/:id/approve', ah(async (req, res) => {
  const game = await store.getGame(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status !== 'pending_payment') {
    return res.status(409).json({ error: 'Only tournaments awaiting payment can be approved' });
  }
  res.json(await store.setStatus(game.id, 'open'));
}));

// Ban a user and take down their upcoming games
router.post('/users/:userId/ban', ah(async (req, res) => {
  const { userId } = req.params;
  const removedGames = await store.banUserAndRemoveGames(userId);
  res.json({ userId, banned: true, removedGames });
}));

// Everything waiting for a decision: reported games and reported comments
router.get('/reported', ah(async (req, res) => {
  const [games, comments] = await Promise.all([store.listReportedGames(), store.listReportedComments()]);
  const named = (id, name) => name || fallbackName(id);
  res.json({
    games: games.map((g) => ({ ...g, hostName: named(g.hostId, g.hostName) })),
    comments: comments.map((c) => ({ ...c, authorName: named(c.authorId, c.authorName) })),
  });
}));

// The report was a false alarm: clear it and keep the game
router.post('/games/:id/reports/dismiss', ah(async (req, res) => {
  await store.dismissGameReports(req.params.id);
  res.status(204).end();
}));

router.delete('/comments/:commentId', ah(async (req, res) => {
  const comment = await store.findComment(req.params.commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  await store.deleteComment(comment.id);
  res.status(204).end();
}));

router.post('/comments/:commentId/reports/dismiss', ah(async (req, res) => {
  await store.dismissCommentReports(req.params.commentId);
  res.status(204).end();
}));

router.get('/banned', ah(async (req, res) => {
  const banned = await store.listBanned();
  res.json(banned.map((b) => ({ ...b, name: b.name || fallbackName(b.userId) })));
}));

router.post('/users/:userId/unban', ah(async (req, res) => {
  if (!(await store.unbanUser(req.params.userId))) return res.status(404).json({ error: 'That person is not banned' });
  res.json({ userId: req.params.userId, banned: false });
}));

module.exports = router;
