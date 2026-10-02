// Per-person rate limits. Each signed-in person gets their own allowance per
// action, so one person (or a script using their account) can't flood GongGo.
// It counts attempts, including rejected ones, so hammering a route doesn't help.
//
// Counts are kept in memory, per container. With one container that's exact;
// if GongGo ever runs several, move the counts to a shared store such as Redis.
const { rateLimit } = require('express-rate-limit');
const { RATE_LIMITS } = require('../constants');

function limiter(name) {
  const { max, windowMinutes } = RATE_LIMITS[name];
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    keyGenerator: (req) => `${name}:${req.userId}`, // runs after requireUser, so userId is set
    standardHeaders: 'draft-7', // tells clients how long to wait (RateLimit and Retry-After headers)
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: `You're doing that a lot. Try again in a few minutes (limit: ${max} every ${windowMinutes} minutes).`,
      });
    },
  });
}

module.exports = {
  postGameLimit: limiter('postGame'),
  editGameLimit: limiter('editGame'),
  joinLeaveLimit: limiter('joinLeave'),
  commentLimit: limiter('comment'),
  reportLimit: limiter('report'),
  profileLimit: limiter('profile'),
};
