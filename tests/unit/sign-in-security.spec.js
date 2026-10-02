// Security checks for real (Cognito) sign-in, without needing Cognito.
// We make our own signing key, publish it the way Cognito would, and check
// that our verifier settings accept a genuine token and reject the fakes.
const { test, expect } = require('@playwright/test');
const crypto = require('crypto');
const path = require('path');
const { spawnSync } = require('child_process');
const { CognitoJwtVerifier } = require('aws-jwt-verify');
const { verifierOptions } = require('../../src/auth');

const POOL = 'ap-southeast-2_TestPool1';
const CLIENT = 'test-client-id';
const ISSUER = `https://cognito-idp.ap-southeast-2.amazonaws.com/${POOL}`;

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
function sign(claims, key = privateKey, kid = 'test-key') {
  const head = b64({ alg: 'RS256', kid, typ: 'JWT' });
  const body = b64(claims);
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url');
  return `${head}.${body}.${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);
const genuine = (overrides = {}) => ({
  sub: 'user-123', aud: CLIENT, iss: ISSUER, token_use: 'id',
  email: 'sam@example.com', given_name: 'Sam', iat: now(), exp: now() + 3600, auth_time: now(),
  ...overrides,
});

function makeVerifier() {
  const v = CognitoJwtVerifier.create(verifierOptions({ userPoolId: POOL, clientId: CLIENT }));
  v.cacheJwks({ keys: [jwk] }); // use our key instead of downloading Cognito's
  return v;
}

test.describe('Sign-in token checks', () => {
  test('accepts a genuine ID token', async () => {
    const claims = await makeVerifier().verify(sign(genuine()));
    expect(claims.sub).toBe('user-123');
  });

  const fakes = {
    'an expired token': () => sign(genuine({ iat: now() - 7200, exp: now() - 3600 })),
    'a token for a different app': () => sign(genuine({ aud: 'some-other-app' })),
    'a token from a different user pool': () => sign(genuine({ iss: `https://cognito-idp.ap-southeast-2.amazonaws.com/ap-southeast-2_Evil` })),
    'an access token instead of an ID token': () => sign(genuine({ token_use: 'access' })),
    'a token signed by someone else\'s key': () => sign(genuine(), crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey),
    'a token whose contents were edited after signing': () => {
      const [h, , s] = sign(genuine()).split('.');
      return `${h}.${b64(genuine({ sub: 'admin' }))}.${s}`;
    },
    'an unsigned token': () => `${b64({ alg: 'none', typ: 'JWT' })}.${b64(genuine())}.`,
  };

  for (const [label, makeToken] of Object.entries(fakes)) {
    test(`rejects ${label}`, async () => {
      await expect(makeVerifier().verify(makeToken())).rejects.toThrow();
    });
  }
});

test('the server refuses to start in production without real sign-in', () => {
  const result = spawnSync(process.execPath, ['src/server.js'], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, NODE_ENV: 'production', COGNITO_USER_POOL_ID: '', COGNITO_CLIENT_ID: '', ALLOW_DEV_AUTH: '', PORT: '3999' },
    encoding: 'utf8',
    timeout: 15000,
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr + result.stdout).toContain('Refusing to start');
});
