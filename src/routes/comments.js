// Comments on a game: /games/:id/comments
// Only the people playing (host included) can read and write them, so the
// conversation stays between the people who are actually turning up.
const express = require('express');
const store = require('../store');
const { requireUser } = require('../middleware/auth');
const { fallbackName } = require('../validation');
const ah = require('../asyncHandler');
const { commentLimit, reportLimit } = require('../middleware/rateLimit');

const router = express.Router({ mergeParams: true });
const MAX_LENGTH = 500;

// Loads the game and checks the caller is in it. Sends the error and returns
// null if not.
async function gameForPlayer(req, res) {
  const game = await store.getGame(req.params.id);
  if (!game || game.status === 'removed') {
    res.status(404).json({ error: 'Game not found' });
    return null;
  }
  if (!game.players.includes(req.userId)) {
    res.status(403).json({ error: 'Join this game to see and post comments.' });
    return null;
  }
  return game;
}

router.get('/', requireUser, ah(async (req, res) => {
  const game = await gameForPlayer(req, res);
  if (!game) return;
  const comments = await store.listComments(game.id);
  res.json(comments.map((c) => ({
    ...c,
    authorName: c.authorName || fallbackName(c.userId),
    isHost: c.userId === game.hostId,
    canDelete: c.userId === req.userId || game.hostId === req.userId,
  })));
}));

router.post('/', requireUser, commentLimit, ah(async (req, res) => {
  const game = await gameForPlayer(req, res);
  if (!game) return;
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > MAX_LENGTH) {
    return res.status(400).json({ errors: [`comment must be 1-${MAX_LENGTH} characters`] });
  }
  const comment = await store.addComment(game.id, req.userId, body);
  res.status(201).json({ ...comment, authorName: req.user.name || fallbackName(req.userId) });
}));

// The author can delete their own comment; the host can delete any in their game
router.delete('/:commentId', requireUser, ah(async (req, res) => {
  const game = await gameForPlayer(req, res);
  if (!game) return;
  const comment = await store.getComment(game.id, req.params.commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.userId !== req.userId && game.hostId !== req.userId) {
    return res.status(403).json({ error: 'You can only delete your own comments.' });
  }
  await store.deleteComment(comment.id);
  res.status(204).end();
}));

// Report someone else's comment for the admins to look at
router.post('/:commentId/report', requireUser, reportLimit, ah(async (req, res) => {
  const game = await gameForPlayer(req, res);
  if (!game) return;
  const comment = await store.getCommentInGame(game.id, req.params.commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.userId === req.userId) return res.status(400).json({ error: "You can't report your own comment; delete it instead" });

  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 300) return res.status(400).json({ errors: ['reason must be 3-300 characters'] });

  try {
    res.status(201).json(await store.addCommentReport(comment.id, req.userId, reason));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'You have already reported this comment' });
    throw err;
  }
}));

module.exports = router;
