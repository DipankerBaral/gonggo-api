const express = require('express');
const store = require('../store');
const { requireAdmin } = require('../middleware/auth');
const { isUpcoming } = require('../gameHelpers');

const router = express.Router();
router.use(requireAdmin);

// Everything, including cancelled, removed and unpaid tournaments
router.get('/games', (req, res) => {
  const reports = store.listReports();
  const games = store.listGames()
    .map((g) => ({ ...g, reportCount: reports.filter((r) => r.gameId === g.id).length }))
    .sort((a, b) => b.reportCount - a.reportCount || new Date(b.createdAt) - new Date(a.createdAt));
  res.json(games);
});

router.get('/reports', (req, res) => res.json(store.listReports()));

router.post('/games/:id/remove', (req, res) => {
  const game = store.getGame(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason) return res.status(400).json({ errors: ['reason is required'] });
  res.json(store.updateGame(game.id, { status: 'removed', removedReason: reason }));
});

// Placeholder until Stripe: admin marks a tournament as paid and publishes it
router.post('/games/:id/approve', (req, res) => {
  const game = store.getGame(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status !== 'pending_payment') {
    return res.status(409).json({ error: 'Only tournaments awaiting payment can be approved' });
  }
  res.json(store.updateGame(game.id, { status: 'open' }));
});

// Ban a user and take down their upcoming games
router.post('/users/:userId/ban', (req, res) => {
  const { userId } = req.params;
  store.banUser(userId);
  const removed = store.listGames()
    .filter((g) => g.hostId === userId && isUpcoming(g) && ['open', 'pending_payment'].includes(g.status))
    .map((g) => store.updateGame(g.id, { status: 'removed', removedReason: 'Host banned' }).id);
  res.json({ userId, banned: true, removedGames: removed });
});

module.exports = router;
