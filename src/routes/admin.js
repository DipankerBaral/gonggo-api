const express = require('express');
const store = require('../store');
const { requireAdmin } = require('../middleware/auth');
const ah = require('../asyncHandler');

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

module.exports = router;
