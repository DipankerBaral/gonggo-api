const express = require('express');
const store = require('../store');
const { requireUser } = require('../middleware/auth');
const { isUpcoming, toPublic } = require('../gameHelpers');
const { HISTORY_DAYS } = require('../constants');
const { validateName } = require('../validation');
const ah = require('../asyncHandler');

const router = express.Router();

// GET /me: who am I? name is null until they choose one.
router.get('/', requireUser, (req, res) => res.json(req.user));

// PATCH /me { name }: choose or change the name other players see
router.patch('/', requireUser, ah(async (req, res) => {
  const { name, error } = validateName(req.body?.name);
  if (error) return res.status(400).json({ errors: [error] });
  res.json(await store.setDisplayName(req.userId, name));
}));

// GET /me/games: what you're hosting or have joined. Upcoming games, plus
// games from the last HISTORY_DAYS days that have already dropped off the
// public list.
router.get('/games', requireUser, ah(async (req, res) => {
  const games = await store.listGamesForUser(req.userId, HISTORY_DAYS);
  const withRole = (g) => ({ ...toPublic(g), role: g.hostId === req.userId ? 'host' : 'player' });

  res.json({
    historyDays: HISTORY_DAYS,
    upcoming: games.filter(isUpcoming).map(withRole),
    past: games.filter((g) => !isUpcoming(g)).reverse().map(withRole), // most recent first
  });
}));

module.exports = router;
