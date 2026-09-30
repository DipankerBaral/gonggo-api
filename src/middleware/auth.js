// TEMPORARY auth: the caller says who they are with an x-user-id header.
// This lets us build and test the rules now. We'll replace it with real
// logins (JWT or AWS Cognito) later in the roadmap.
const store = require('../store');
const config = require('../config');
const asyncHandler = require('../asyncHandler');

const requireUser = asyncHandler(async (req, res, next) => {
  const userId = (req.get('x-user-id') || '').trim();
  if (!userId) return res.status(401).json({ error: 'Missing x-user-id header' });
  if (await store.isBanned(userId)) return res.status(403).json({ error: 'This account has been banned' });
  req.userId = userId;
  next();
});

function requireAdmin(req, res, next) {
  if (req.get('x-admin-key') !== config.adminKey) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { requireUser, requireAdmin };
