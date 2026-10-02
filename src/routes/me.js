const express = require('express');
const store = require('../store');
const { requireUser, requireSignedIn } = require('../middleware/auth');
const { isUpcoming, toPublic } = require('../gameHelpers');
const { HISTORY_DAYS } = require('../constants');
const { validateName, ageOn } = require('../validation');
const { TERMS_VERSION, MIN_AGE } = require('../constants');
const { profileLimit } = require('../middleware/rateLimit');
const { deleteCognitoUser } = require('../auth/cognitoAdmin');
const ah = require('../asyncHandler');

const router = express.Router();

// GET /me: who am I? name is null until they choose one.
router.get('/', requireSignedIn, (req, res) => res.json({ ...req.user, termsVersion: TERMS_VERSION }));

// POST /me/consent { dateOfBirth: 'YYYY-MM-DD', acceptTerms: true }
// Checks they're 18+ (the date is used for this check only and never stored)
router.post('/consent', requireSignedIn, profileLimit, ah(async (req, res) => {
  const { dateOfBirth, acceptTerms } = req.body || {};
  const age = ageOn(dateOfBirth);
  if (age === null || age < 0 || age > 120) return res.status(400).json({ errors: ['dateOfBirth must be a real date, like 1996-04-23'] });
  if (acceptTerms !== true) return res.status(400).json({ errors: ['You need to accept the Terms of Use and Privacy Policy'] });
  if (age < MIN_AGE) {
    return res.status(403).json({ code: 'under_age', error: `GongGo is for people aged ${MIN_AGE} and over.` });
  }
  const user = await store.recordConsent(req.userId, TERMS_VERSION);
  res.json({ ...req.user, ...user, consented: true, termsVersion: TERMS_VERSION });
}));

// DELETE /me: delete my account and everything that belongs to it
router.delete('/', requireSignedIn, profileLimit, ah(async (req, res) => {
  const result = await store.deleteUserData(req.userId);
  await deleteCognitoUser(req.cognitoUsername); // and their sign-in, so the account is really gone
  res.json({ deleted: true, deletedGames: result.deletedGames });
}));

// PATCH /me { name }: choose or change the name other players see
router.patch('/', requireSignedIn, profileLimit, ah(async (req, res) => {
  const { name, error } = validateName(req.body?.name);
  if (error) return res.status(400).json({ errors: [error] });
  const { termsVersion, ...updated } = await store.setDisplayName(req.userId, name);
  res.json({ ...updated, isAdmin: req.user.isAdmin, consented: req.user.consented });
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
