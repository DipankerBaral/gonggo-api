// Who is making this request?
//
// cognito mode (AWS): the browser sends "Authorization: Bearer <ID token>".
//   The token is signed by Amazon Cognito; we check the signature, expiry,
//   issuer and audience with AWS's own library. Nobody can fake another user.
//
// dev mode (your laptop and the automated tests): the caller simply says who
//   they are with an x-user-id header, like before. Convenient, and completely
//   insecure, so it's refused in production unless ALLOW_DEV_AUTH=true is set
//   on purpose (docker-compose and CI do; AWS never does).
const { CognitoJwtVerifier } = require('aws-jwt-verify');
const config = require('../config');

let verifier = null;

// Exactly what a valid token must match. Exported so tests can check the rules.
const verifierOptions = ({ userPoolId, clientId }) => ({
  userPoolId,
  clientId,
  tokenUse: 'id', // ID tokens carry the email and name; access tokens don't
});

function getVerifier() {
  if (!verifier) verifier = CognitoJwtVerifier.create(verifierOptions(config.auth));
  return verifier;
}

// For tests: verify tokens against a locally generated key instead of Cognito's
function useVerifier(custom) {
  verifier = custom;
}

function checkStartupSafety() {
  if (config.auth.mode === 'dev') {
    if (process.env.NODE_ENV === 'production' && !config.auth.allowDevAuth) {
      throw new Error(
        'Refusing to start: no Cognito settings, so sign-in would fall back to insecure dev mode. '
        + 'Set COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID (or ALLOW_DEV_AUTH=true for local Docker only).',
      );
    }
    console.warn('WARNING: dev sign-in mode. Anyone can act as anyone. Never use this in production.');
  } else {
    console.log(`Sign-in: Amazon Cognito (${config.auth.userPoolId})`);
  }
}

// Returns { id, email, suggestedName } or null if not signed in.
// Throws { status: 401 } for a token that is present but invalid.
async function identify(req) {
  if (config.auth.mode === 'cognito') {
    const header = req.get('authorization') || '';
    const match = header.match(/^Bearer (.+)$/);
    if (!match) return null;
    try {
      const claims = await getVerifier().verify(match[1]);
      return {
        id: claims.sub,
        email: claims.email || null,
        suggestedName: claims.given_name || (claims.name ? String(claims.name).split(' ')[0] : null),
      };
    } catch {
      const err = new Error('Your sign-in has expired or is invalid. Sign in again.');
      err.status = 401;
      throw err;
    }
  }

  const id = (req.get('x-user-id') || '').trim();
  if (!id) return null;
  let name = req.get('x-user-name') || '';
  try { name = decodeURIComponent(name); } catch { /* keep as is */ }
  return { id, email: null, suggestedName: name.trim() || null };
}

// What the browser needs to start a sign-in (nothing secret in here)
function publicConfig() {
  if (config.auth.mode !== 'cognito') return { mode: 'dev' };
  return {
    mode: 'cognito',
    domain: config.auth.domain,
    clientId: config.auth.clientId,
    providers: config.auth.providers,
  };
}

module.exports = { identify, publicConfig, checkStartupSafety, useVerifier, verifierOptions };
