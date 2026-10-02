const store = require('../store');
const config = require('../config');
const { identify } = require('../auth');
const asyncHandler = require('../asyncHandler');

const { TERMS_VERSION } = require('../constants');

const ADMIN_GROUP = 'admins';

// Signed-in users only. Sets req.userId and req.user ({ id, name, email, isAdmin, consented }).
// By default they must also have confirmed they're 18+ and accepted the current
// terms; { consent: false } is for the few routes that come before that
// (seeing your profile, giving consent, deleting your account).
function makeRequireUser({ consent = true } = {}) {
  return asyncHandler(async (req, res, next) => {
    let who;
    try {
      who = await identify(req);
    } catch (err) {
      return res.status(err.status || 401).json({ error: err.message });
    }
    if (!who) return res.status(401).json({ error: 'Sign in to do this.' });
    if (await store.isBanned(who.id)) return res.status(403).json({ error: 'This account has been banned' });

    let user = await store.ensureUser(who);
    if (who.devConsent && user.termsVersion !== TERMS_VERSION) user = await store.recordConsent(who.id, TERMS_VERSION);
    const { termsVersion, ...rest } = user;
    req.user = { ...rest, isAdmin: who.groups.includes(ADMIN_GROUP), consented: termsVersion === TERMS_VERSION };
    req.userId = who.id;
    req.cognitoUsername = who.cognitoUsername;

    if (consent && !req.user.consented) {
      return res.status(403).json({
        code: 'consent_required',
        error: "Before using GongGo, confirm you're 18 or older and accept the Terms of Use and Privacy Policy.",
      });
    }
    next();
  });
}

const requireUser = makeRequireUser();
const requireSignedIn = makeRequireUser({ consent: false });

// Admins: people in the Cognito "admins" group. The admin key still works
// for scripts and automated tests that don't sign in.
const requireAdmin = asyncHandler(async (req, res, next) => {
  if (req.get('x-admin-key') === config.adminKey) return next();
  let who;
  try { who = await identify(req); } catch { who = null; }
  if (!who || !who.groups.includes(ADMIN_GROUP)) return res.status(403).json({ error: 'Admin access required' });
  req.userId = who.id;
  next();
});

module.exports = { requireUser, requireSignedIn, requireAdmin };
