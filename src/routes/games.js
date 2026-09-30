const express = require('express');
const store = require('../store');
const { requireUser } = require('../middleware/auth');
const { validateGame } = require('../validation');
const { isUpcoming, isActive, toPublic } = require('../gameHelpers');

const router = express.Router();

// GET /games?sport=soccer&hasSpots=true
router.get('/', (req, res) => {
  const { sport, hasSpots } = req.query;
  let games = store.listGames().filter((g) => g.status === 'open' && isUpcoming(g));
  if (sport) games = games.filter((g) => g.sport === sport);
  if (hasSpots === 'true') games = games.filter((g) => g.players.length < g.capacity);
  games.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  res.json(games.map(toPublic));
});

router.get('/:id', (req, res) => {
  const game = store.getGame(req.params.id);
  if (!game || game.status === 'removed') return res.status(404).json({ error: 'Game not found' });
  res.json({ ...toPublic(game), players: game.players });
});

router.post('/', requireUser, (req, res) => {
  const { errors, value } = validateGame(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const existing = store.listGames().find((g) => g.hostId === req.userId && isActive(g));
  if (existing) {
    return res.status(409).json({
      error: 'You already have an active game. Cancel it or wait until it has started before posting another.',
      gameId: existing.id,
    });
  }

  const game = store.createGame({ ...value, hostId: req.userId });
  res.status(201).json(toPublic(game));
});

router.post('/:id/join', requireUser, (req, res) => {
  const game = store.getGame(req.params.id);
  if (!game || game.status !== 'open') return res.status(404).json({ error: 'Game not found' });
  if (!isUpcoming(game)) return res.status(409).json({ error: 'This game has already started' });
  if (game.players.includes(req.userId)) return res.status(409).json({ error: 'You have already joined this game' });
  if (game.players.length >= game.capacity) return res.status(409).json({ error: 'No spots left' });

  res.json(toPublic(store.addPlayer(game.id, req.userId)));
});

router.delete('/:id/join', requireUser, (req, res) => {
  const game = store.getGame(req.params.id);
  if (!game || game.status !== 'open') return res.status(404).json({ error: 'Game not found' });
  if (game.hostId === req.userId) {
    return res.status(400).json({ error: 'Hosts cannot leave their own game; cancel it instead' });
  }
  if (!game.players.includes(req.userId)) return res.status(409).json({ error: 'You are not in this game' });

  res.json(toPublic(store.removePlayer(game.id, req.userId)));
});

// Host cancels their game
router.delete('/:id', requireUser, (req, res) => {
  const game = store.getGame(req.params.id);
  if (!game || game.status === 'removed') return res.status(404).json({ error: 'Game not found' });
  if (game.hostId !== req.userId) return res.status(403).json({ error: 'Only the host can cancel this game' });

  res.json(toPublic(store.updateGame(game.id, { status: 'cancelled' })));
});

// Anyone can flag a game for the admin to look at
router.post('/:id/report', requireUser, (req, res) => {
  const game = store.getGame(req.params.id);
  if (!game || game.status === 'removed') return res.status(404).json({ error: 'Game not found' });

  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 300) {
    return res.status(400).json({ errors: ['reason must be 3-300 characters'] });
  }
  const already = store.listReports().some((r) => r.gameId === game.id && r.reporterId === req.userId);
  if (already) return res.status(409).json({ error: 'You have already reported this game' });

  res.status(201).json(store.addReport({ gameId: game.id, reporterId: req.userId, reason }));
});

module.exports = router;
