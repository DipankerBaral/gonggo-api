// GongGo sign-in for the browser.
//
// cognito mode (AWS): sign-in happens on Amazon Cognito's own pages (email and
//   password, Google, Apple), so GongGo never sees anyone's password. We use
//   the OAuth "authorization code + PKCE" flow, the standard secure flow for
//   web apps: Cognito sends back a one-time code, which only this browser can
//   swap for tokens because only it knows the matching secret (the verifier).
//
// dev mode (laptop and automated tests): type a first name and you're "in".
//   The server refuses this mode on AWS.
window.GongGoAuth = (function () {
  'use strict';

  const SESSION_KEY = 'gonggo:session';
  const PKCE_KEY = 'gonggo:pkce';
  let cfg = { mode: 'dev', providers: [] };

  // ---- storage

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  }

  function setSession(value) {
    try {
      if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
      else localStorage.removeItem(SESSION_KEY);
    } catch { /* private browsing: stay signed out */ }
  }

  // ---- helpers

  const base64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const randomString = (length = 48) => base64url(crypto.getRandomValues(new Uint8Array(length)));

  const redirectUri = () => `${location.origin}/`;
  const cognitoUrl = (path) => `https://${cfg.domain}${path}`;

  async function tokenRequest(params) {
    const res = await fetch(cognitoUrl('/oauth2/token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: cfg.clientId, ...params }),
    });
    if (!res.ok) throw new Error('token request failed');
    return res.json();
  }

  function saveTokens(tokens, previous = {}) {
    setSession({
      idToken: tokens.id_token,
      refreshToken: tokens.refresh_token || previous.refreshToken, // refresh responses don't repeat it
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });
  }

  // ---- Cognito flow

  // Sends the browser to Cognito. provider: 'Google', 'SignInWithApple', or
  // nothing for email and password (which also offers "Sign up").
  async function startSignIn(provider) {
    const verifier = randomString(64);
    const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const state = randomString(16); // checked on return, so nobody can inject their own sign-in
    sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, returnTo: location.hash || '#/' }));

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: cfg.clientId,
      redirect_uri: redirectUri(),
      scope: 'openid email profile',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    if (provider) params.set('identity_provider', provider);
    location.assign(cognitoUrl(`/oauth2/authorize?${params}`));
  }

  // Runs on page load: if Cognito just sent us back with a code, finish signing in
  async function finishSignInIfReturning() {
    const url = new URL(location.href);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error_description') || url.searchParams.get('error');
    if (!code && !error) return null;

    let pkce = null;
    try { pkce = JSON.parse(sessionStorage.getItem(PKCE_KEY)); } catch { /* ignore */ }
    sessionStorage.removeItem(PKCE_KEY);
    // Clean the code out of the address bar and go back where they started
    history.replaceState(null, '', `${location.pathname}${(pkce && pkce.returnTo) || '#/'}`);

    if (error) return { error: 'Sign-in was cancelled or failed. Try again.' };
    if (!pkce || pkce.state !== url.searchParams.get('state')) {
      return { error: "Sign-in couldn't be completed. Try again." };
    }
    try {
      saveTokens(await tokenRequest({
        grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: pkce.verifier,
      }));
      return { signedIn: true };
    } catch {
      return { error: "Sign-in couldn't be completed. Try again." };
    }
  }

  // ID tokens last an hour. Swap the refresh token for a new one shortly before.
  async function freshSession() {
    const session = getSession();
    if (!session || cfg.mode !== 'cognito') return session;
    if (session.expiresAt - Date.now() > 60 * 1000) return session;
    try {
      saveTokens(await tokenRequest({ grant_type: 'refresh_token', refresh_token: session.refreshToken }), session);
      return getSession();
    } catch {
      setSession(null); // refresh token expired or revoked: sign in again
      return null;
    }
  }

  // ---- public

  async function init() {
    try {
      const res = await fetch('/config');
      cfg = (await res.json()).auth;
    } catch { /* offline: dev defaults, sign-in disabled */ }
    if (cfg.mode === 'cognito') return finishSignInIfReturning();
    return null;
  }

  // Headers that prove who's asking, for every API request
  async function headers() {
    const session = await freshSession();
    if (!session) return {};
    if (cfg.mode === 'cognito') return { Authorization: `Bearer ${session.idToken}` };
    return { 'x-user-id': session.id, ...(session.name ? { 'x-user-name': encodeURIComponent(session.name) } : {}) };
  }

  function devSignIn(name) {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'player';
    const tag = Math.random().toString(16).slice(2, 6).padEnd(4, '0');
    setSession({ id: `${slug}-${tag}`, name: name.trim() });
  }

  // Forget the session here; in cognito mode also end it on Cognito's side
  function signOut() {
    setSession(null);
    if (cfg.mode === 'cognito') {
      const params = new URLSearchParams({ client_id: cfg.clientId, logout_uri: redirectUri() });
      location.assign(cognitoUrl(`/logout?${params}`));
    }
  }

  return {
    init,
    headers,
    startSignIn,
    devSignIn,
    signOut,
    forget: () => setSession(null),
    isSignedIn: () => !!getSession(),
    mode: () => cfg.mode,
    providers: () => cfg.providers || [],
  };
})();
