const store = require('../store');
const config = require('../config');
const { identify } = require('../auth');
const asyncHandler = require('../asyncHandler');

// Signed-in users only. Sets req.userId and req.user ({ id, name, email }).
const requireUser = asyncHandler(async (req, res, next) => {
  let who;
  try {
    who = await identify(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }
  if (!who) return res.status(401).json({ error: 'Sign in to do this.' });
  if (await store.isBanned(who.id)) return res.status(403).json({ error: 'This account has been banned' });

  req.user = await store.ensureUser(who);
  req.userId = who.id;
  next();
});

function requireAdmin(req, res, next) {
  if (req.get('x-admin-key') !== config.adminKey) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { requireUser, requireAdmin };
