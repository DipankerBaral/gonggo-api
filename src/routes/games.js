const express = require('express');
const store = require('../store');
const { requireUser } = require('../middleware/auth');
const { validateGame } = require('../validation');
const { isUpcoming, toPublic } = require('../gameHelpers');
const ah = require('../asyncHandler');

const router = express.Router();

// GET /games?sport=soccer&hasSpots=true
router.get('/', ah(async (req, res) => {
  const games = await store.listOpenGames({
    sport: req.query.sport,
    hasSpots: req.query.hasSpots === 'true',
  });
  res.json(games.map(toPublic));
}));

router.get('/:id', ah(async (req, res) => {
  const game = await store.getGame(req.params.id);
  if (!game || game.status === 'removed') return res.status(404).json({ error: 'Game not found' });
  res.json({ ...toPublic(game), players: game.players });
}));

router.post('/', requireUser, ah(async (req, res) => {
  const { errors, value } = validateGame(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const { game, existingId } = await store.createGameIfNoActive({ ...value, hostId: req.userId });
  if (existingId) {
    return res.status(409).json({
      error: 'You already have an active game. Cancel it or wait until it has started before posting another.',
      gameId: existingId,
    });
  }
  res.status(201).json(toPublic(game));
}));

router.post('/:id/join', requireUser, ah(async (req, res) => {
  const game = await store.getGame(req.params.id);
  if (!game || game.status !== 'open') return res.status(404).json({ error: 'Game not found' });
  if (!isUpcoming(game)) return res.status(409).json({ error: 'This game has already started' });
  if (game.players.includes(req.userId)) return res.status(409).json({ error: 'You have already joined this game' });

  try {
    const updated = await store.addPlayerIfSpace(game.id, req.userId);
    if (!updated) return res.status(409).json({ error: 'No spots left' });
    res.json(toPublic(updated));
  } catch (err) {
    // 23505 = unique violation: the same person joined twice at the same instant
    if (err.code === '23505') return res.status(409).json({ error: 'You have already joined this game' });
    throw err;
  }
}));

router.delete('/:id/join', requireUser, ah(async (req, res) => {
  const game = await store.getGame(req.params.id);
  if (!game || game.status !== 'open') return res.status(404).json({ error: 'Game not found' });
  if (game.hostId === req.userId) {
    return res.status(400).json({ error: 'Hosts cannot leave their own game; cancel it instead' });
  }
  if (!game.players.includes(req.userId)) return res.status(409).json({ error: 'You are not in this game' });

  res.json(toPublic(await store.removePlayer(game.id, req.userId)));
}));

// Host cancels their game
router.delete('/:id', requireUser, ah(async (req, res) => {
  const game = await store.getGame(req.params.id);
  if (!game || game.status === 'removed') return res.status(404).json({ error: 'Game not found' });
  if (game.hostId !== req.userId) return res.status(403).json({ error: 'Only the host can cancel this game' });

  res.json(toPublic(await store.setStatus(game.id, 'cancelled')));
}));

// Anyone can flag a game for the admin to look at
router.post('/:id/report', requireUser, ah(async (req, res) => {
  const game = await store.getGame(req.params.id);
  if (!game || game.status === 'removed') return res.status(404).json({ error: 'Game not found' });

  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 300) {
    return res.status(400).json({ errors: ['reason must be 3-300 characters'] });
  }
  if (await store.hasReported(game.id, req.userId)) {
    return res.status(409).json({ error: 'You have already reported this game' });
  }

  try {
    res.status(201).json(await store.addReport({ gameId: game.id, reporterId: req.userId, reason }));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'You have already reported this game' });
    throw err;
  }
}));

module.exports = router;
