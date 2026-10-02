const express = require('express');
const store = require('../store');
const { requireUser } = require('../middleware/auth');
const { validateGame, validateGameEdit, fallbackName } = require('../validation');
const { isOver, toPublic } = require('../gameHelpers');
const limits = require('../middleware/rateLimit');
const { MAX_ACTIVE_GAMES } = require('../constants');
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
  const players = await store.listPlayersWithNames(game.id);
  res.json({ ...toPublic(game), players: players.map((p) => ({ id: p.id, name: p.name || fallbackName(p.id) })) });
}));

router.post('/', requireUser, limits.postGameLimit, ah(async (req, res) => {
  const { errors, value } = validateGame(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const { game, activeIds } = await store.createGameIfUnderLimit({ ...value, hostId: req.userId }, MAX_ACTIVE_GAMES);
  if (activeIds) {
    return res.status(409).json({
      error: `You already have ${MAX_ACTIVE_GAMES} upcoming games. Cancel one, or wait until one has started, before posting another.`,
      gameIds: activeIds,
    });
  }
  res.status(201).json(toPublic(game));
}));

router.post('/:id/join', requireUser, limits.joinLeaveLimit, ah(async (req, res) => {
  const game = await store.getGame(req.params.id);
  if (!game || game.status !== 'open') return res.status(404).json({ error: 'Game not found' });
  // Joining late is fine (people turn up 10 minutes in); joining a finished game isn't
  if (isOver(game)) return res.status(409).json({ error: 'This game has finished' });
  if (await store.wasRemovedFrom(game.id, req.userId)) {
    return res.status(403).json({ error: 'The host has removed you from this game.' });
  }
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

router.delete('/:id/join', requireUser, limits.joinLeaveLimit, ah(async (req, res) => {
  const game = await store.getGame(req.params.id);
  if (!game || game.status !== 'open') return res.status(404).json({ error: 'Game not found' });
  if (game.hostId === req.userId) {
    return res.status(400).json({ error: 'Hosts cannot leave their own game; cancel it instead' });
  }
  if (!game.players.includes(req.userId)) return res.status(409).json({ error: 'You are not in this game' });

  res.json(toPublic(await store.removePlayer(game.id, req.userId)));
}));

// Host edits their game: PATCH with just the fields that change
router.patch('/:id', requireUser, limits.editGameLimit, ah(async (req, res) => {
  const game = await store.getGame(req.params.id);
  if (!game || game.status === 'removed') return res.status(404).json({ error: 'Game not found' });
  if (game.hostId !== req.userId) return res.status(403).json({ error: 'Only the host can edit this game' });
  if (game.status === 'cancelled') return res.status(409).json({ error: 'This game was cancelled' });
  if (isOver(game)) return res.status(409).json({ error: 'This game has finished' });

  const { errors, value, changed } = validateGameEdit(req.body, game);
  if (errors.length) return res.status(400).json({ errors });

  const updated = await store.updateGameDetails(game.id, value);
  res.json({ ...toPublic(updated), changed }); // `changed` will drive notifications in batch 3
}));

// Host removes someone from their game (no-shows, trouble). They can't rejoin.
router.delete('/:id/players/:userId', requireUser, limits.editGameLimit, ah(async (req, res) => {
  const game = await store.getGame(req.params.id);
  if (!game || game.status === 'removed') return res.status(404).json({ error: 'Game not found' });
  if (game.hostId !== req.userId) return res.status(403).json({ error: 'Only the host can remove players' });
  if (req.params.userId === game.hostId) {
    return res.status(400).json({ error: "Hosts can't remove themselves; cancel the game instead" });
  }
  if (!game.players.includes(req.params.userId)) return res.status(404).json({ error: 'That person is not in this game' });

  await store.removePlayerByHost(game.id, req.params.userId);
  res.json(toPublic(await store.getGame(game.id)));
}));

// Host cancels their game
router.delete('/:id', requireUser, ah(async (req, res) => {
  const game = await store.getGame(req.params.id);
  if (!game || game.status === 'removed') return res.status(404).json({ error: 'Game not found' });
  if (game.hostId !== req.userId) return res.status(403).json({ error: 'Only the host can cancel this game' });

  res.json(toPublic(await store.setStatus(game.id, 'cancelled')));
}));

// Anyone can flag a game for the admin to look at
router.post('/:id/report', requireUser, limits.reportLimit, ah(async (req, res) => {
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
