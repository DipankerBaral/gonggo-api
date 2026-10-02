// GongGo front end. Plain JavaScript, no build step: the browser runs this file as is.
// Routes (after the # in the URL):
//   #/            list of upcoming games
//   #/map         the same games on a map
//   #/game/<id>   one game: details, who's coming, join or leave
//   #/new         post a game
//   #/me          my games: hosting and joined, upcoming and the last 30 days
(function () {
  'use strict';

  const TZ = 'Australia/Sydney';
  const WOLLONGONG = [-34.425, 150.893];
  const REGION = [[-34.8, 150.55], [-34.15, 151.05]]; // same box the API accepts

  const SPORTS = {
    soccer: 'Soccer',
    basketball: 'Basketball',
    running: 'Running',
    'table-tennis': 'Table tennis',
    tennis: 'Tennis',
    volleyball: 'Volleyball',
    'touch-football': 'Touch football',
    cricket: 'Cricket',
    'community-event': 'Community event',
    other: 'Other',
  };

  const app = document.getElementById('app');
  const state = { sport: '', hasSpots: false };
  let activeMaps = [];

  // Every page change gets a number. Pages load data from the API, and if the
  // person has already moved on by the time it arrives, that page must not
  // draw itself over the new one (a slow response could overwrite the form).
  let routeSeq = 0;
  const isStale = (seq) => seq !== routeSeq;

  // ---------------------------------------------------------------- helpers

  // Anything a user typed goes through this before it touches the page,
  // so a game titled <script>...</script> shows up as text, not code.
  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  const fmt = (options) => new Intl.DateTimeFormat('en-AU', { timeZone: TZ, ...options });
  const dayKey = (date) => fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const timeParts = (date) => {
    const parts = fmt({ hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(date);
    const get = (type) => (parts.find((p) => p.type === type) || {}).value || '';
    return { time: `${get('hour')}:${get('minute')}`, period: get('dayPeriod').toLowerCase() };
  };

  function dayLabel(date) {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    if (dayKey(date) === dayKey(now)) return 'Today';
    if (dayKey(date) === dayKey(tomorrow)) return 'Tomorrow';
    return fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  }

  function whenLong(date) {
    const { time, period } = timeParts(date);
    return `${fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(date)}, ${time}${period}`;
  }

  // "Friday 2 October, 6:00pm to 7:30pm"
  function whenRange(game) {
    const end = timeParts(new Date(game.endsAt));
    return `${whenLong(new Date(game.startsAt))} to ${end.time}${end.period}`;
  }

  const isOnNow = (game) => new Date(game.startsAt) <= new Date() && new Date(game.endsAt) > new Date();

  // ---------------------------------------------------------------- the user

  const Auth = window.GongGoAuth;
  let profile = null; // { id, name, email } from /me, once signed in

  const validName = (name) => /\p{L}/u.test(String(name).trim());

  function playerName(player) {
    return profile && profile.id === player.id ? `${player.name} (you)` : player.name;
  }

  async function loadProfile() {
    profile = null;
    if (!Auth.isSignedIn()) return null;
    const res = await api('/me');
    profile = res.ok ? res.data : null;
    return profile;
  }

  function renderTopbar() {
    document.getElementById('account').hidden = !profile;
    document.getElementById('sign-in-button').hidden = !!profile;
    if (profile) document.getElementById('account-name').textContent = profile.name || 'Account';
    closeAccountMenu();
  }

  // ---- the account menu in the top bar

  const accountButton = () => document.getElementById('account-button');
  const accountMenu = () => document.getElementById('account-menu');

  function closeAccountMenu({ focusButton = false } = {}) {
    const button = accountButton();
    if (!button || button.getAttribute('aria-expanded') !== 'true') return;
    button.setAttribute('aria-expanded', 'false');
    accountMenu().hidden = true;
    if (focusButton) button.focus();
  }

  function openAccountMenu() {
    accountButton().setAttribute('aria-expanded', 'true');
    accountMenu().hidden = false;
    accountMenu().querySelector('a, button').focus();
  }

  function signOutNow() {
    Auth.signOut(); // in real sign-in this also ends the session on Cognito's side
    profile = null;
    renderTopbar();
    toast('Signed out.');
    location.hash = '#/';
  }

  // Opens a dialog and resolves with the result of `setup` (or null on "Not now")
  function openDialog(dialogId, cancelId, setup) {
    const dialog = document.getElementById(dialogId);
    return new Promise((resolve) => {
      const done = (value) => {
        cancel.removeEventListener('click', onCancel);
        dialog.removeEventListener('cancel', onCancel);
        if (dialog.open) dialog.close();
        resolve(value);
      };
      const onCancel = (event) => { if (event) event.preventDefault(); done(null); };
      const cancel = document.getElementById(cancelId);
      cancel.addEventListener('click', onCancel);
      dialog.addEventListener('cancel', onCancel); // Escape key
      setup(done);
      dialog.showModal();
    });
  }

  // Ask for (or change) the name other players see. Resolves with the profile.
  function askName({ current = '' } = {}) {
    const form = document.getElementById('name-form');
    const input = document.getElementById('name-input');
    const error = document.getElementById('name-error');
    input.value = current;
    error.hidden = true;
    input.removeAttribute('aria-invalid');

    return openDialog('name-dialog', 'name-cancel', (done) => {
      form.onsubmit = async (event) => {
        event.preventDefault();
        if (!validName(input.value)) {
          error.hidden = false;
          input.setAttribute('aria-invalid', 'true');
          input.focus();
          return;
        }
        const res = await api('/me', { method: 'PATCH', body: { name: input.value } });
        if (!res.ok) { toast(errorText(res.data)); return; }
        profile = res.data;
        form.onsubmit = null;
        done(profile);
      };
      setTimeout(() => input.focus());
    });
  }

  // The sign-in dialog. Real mode sends you to Cognito (the page navigates away
  // and comes back signed in); dev mode signs you in with just a first name.
  function showSignIn(title) {
    document.getElementById('signin-title').textContent = title;
    const options = document.getElementById('signin-options');

    return openDialog('signin-dialog', 'signin-cancel', (done) => {
      if (Auth.mode() === 'cognito') {
        const providers = Auth.providers();
        options.innerHTML = `<div class="signin-options">
          ${providers.includes('google') ? '<button type="button" class="button provider" data-provider="Google">Continue with Google</button>' : ''}
          ${providers.includes('apple') ? '<button type="button" class="button provider" data-provider="SignInWithApple">Continue with Apple</button>' : ''}
          <button type="button" class="button" data-provider="">Continue with email</button>
          <p class="signin-note">New to GongGo? You can create an account on the next screen.</p>
        </div>`;
        options.querySelectorAll('[data-provider]').forEach((b) =>
          b.addEventListener('click', () => Auth.startSignIn(b.dataset.provider || undefined)));
        return;
      }

      options.innerHTML = `<form id="dev-signin" class="signin-options" novalidate>
        <span class="dev-badge">Dev mode: for local testing only</span>
        <label for="dev-name">First name</label>
        <input id="dev-name" autocomplete="given-name" maxlength="30" aria-describedby="dev-name-error">
        <p id="dev-name-error" class="field-error" hidden>Use letters, like Sam or Priya.</p>
        <button type="submit" class="button">Sign in</button>
      </form>`;
      const input = document.getElementById('dev-name');
      document.getElementById('dev-signin').addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!validName(input.value)) {
          document.getElementById('dev-name-error').hidden = false;
          input.setAttribute('aria-invalid', 'true');
          input.focus();
          return;
        }
        Auth.devSignIn(input.value);
        await loadProfile();
        renderTopbar();
        done(profile);
      });
      setTimeout(() => input.focus());
    });
  }

  // Resolves with the signed-in profile (with a name), or null if they backed out
  async function requireSignIn(title = 'Sign in to GongGo') {
    if (!profile) await showSignIn(title);
    if (!profile) return null;
    if (!profile.name) await askName();
    return profile && profile.name ? profile : null;
  }

  // ---------------------------------------------------------------- the API

  async function api(path, { method = 'GET', body } = {}) {
    const headers = await Auth.headers();
    if (body) headers['Content-Type'] = 'application/json';
    try {
      const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
      if (res.status === 401 && Auth.isSignedIn()) {
        // The sign-in expired or was revoked: forget it
        Auth.forget();
        profile = null;
        renderTopbar();
      }
      return { ok: res.ok, status: res.status, data };
    } catch {
      return { ok: false, status: 0, data: { error: "Can't reach GongGo. Check your connection and try again." } };
    }
  }

  const errorText = (data) => (data.errors ? data.errors.join('. ') : data.error) || 'Something went wrong. Try again.';

  // ---------------------------------------------------------------- pieces

  function rosterHtml(game, { large = false } = {}) {
    const taken = game.playerCount;
    const cap = game.capacity;
    const left = game.spotsLeft;
    const label = left === 0 ? 'Full' : left === 1 ? '1 spot left' : `${left} spots left`;
    const cls = left === 0 ? 'full' : left <= 2 ? 'last' : '';

    let visual;
    if (cap <= 30) {
      const spots = Array.from({ length: cap }, (_, i) =>
        `<span class="spot ${i < taken ? 'taken' : 'open'}"></span>`).join('');
      visual = `<div class="roster${large ? ' large' : ''}" aria-hidden="true">${spots}</div>`;
    } else {
      visual = `<div class="roster-bar" aria-hidden="true"><span style="width:${(taken / cap) * 100}%"></span></div>`;
    }
    return `<div class="roster-row">${visual}<span class="spots-left ${cls}" data-testid="spots-left">${label}</span>
      <span class="visually-hidden">${taken} of ${cap} spots taken</span></div>`;
  }

  function destroyMaps() {
    activeMaps.forEach((map) => map.remove());
    activeMaps = [];
  }

  function makeMap(el, options = {}) {
    const map = L.map(el, {
      maxBounds: REGION,
      maxBoundsViscosity: 0.8,
      minZoom: 10,
      ...options,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.attributionControl.setPosition('bottomleft'); // keeps the credit clear of the Post button
    activeMaps.push(map);
    return map;
  }

  function pinIcon(game) {
    const last = game.spotsLeft <= 2;
    return L.divIcon({
      className: '',
      html: `<div class="pin${last ? ' last' : ''}"><span>${game.spotsLeft}</span></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -30],
    });
  }

  function filtersHtml() {
    const chips = [['', 'All sports'], ...Object.entries(SPORTS)]
      .map(([value, label]) =>
        `<button type="button" class="chip" data-sport="${value}" aria-pressed="${state.sport === value}">${label}</button>`)
      .join('');
    const spots = `<button type="button" class="chip" data-has-spots aria-pressed="${state.hasSpots}">Has spots</button>`;
    return `<div class="filters" role="toolbar" aria-label="Filter games">${spots}${chips}</div>`;
  }

  function bindFilters(rerender) {
    app.querySelectorAll('[data-sport]').forEach((chip) =>
      chip.addEventListener('click', () => { state.sport = chip.dataset.sport; rerender(); }));
    const spots = app.querySelector('[data-has-spots]');
    if (spots) spots.addEventListener('click', () => { state.hasSpots = !state.hasSpots; rerender(); });
  }

  // One game in a list. My games also shows the date and a status tag.
  function gameRowHtml(game, { withDate = false, tag = '' } = {}) {
    const start = new Date(game.startsAt);
    const { time, period } = timeParts(start);
    const live = game.status === 'open' && new Date(game.endsAt) > new Date();
    const onNow = live && isOnNow(game) ? '<span class="status-tag on-now">On now</span>' : '';
    return `<li><a class="game" href="#/game/${esc(game.id)}" data-testid="game-row">
      <div class="game-time">${time}<small>${period}</small></div>
      <div>
        <div class="game-sport">${esc(SPORTS[game.sport] || game.sport)}</div>
        <h3 class="game-title">${esc(game.title)}</h3>
        ${withDate ? `<div class="game-date">${esc(dayLabel(start))}</div>` : ''}
        <div class="game-place">${esc(game.location.name)}</div>
        ${onNow}${tag}
      </div>
      ${live ? rosterHtml(game) : ''}
    </a></li>`;
  }

  async function loadGames() {
    const params = new URLSearchParams();
    if (state.sport) params.set('sport', state.sport);
    if (state.hasSpots) params.set('hasSpots', 'true');
    return api(`/games${params.toString() ? `?${params}` : ''}`);
  }

  // ---------------------------------------------------------------- views

  async function listView() {
    document.title = 'GongGo: pickup games around Wollongong';
    const seq = routeSeq;
    const res = await loadGames();
    if (isStale(seq)) return;

    if (!res.ok) {
      app.innerHTML = `${filtersHtml()}<div class="errors" role="alert">${esc(errorText(res.data))}</div>`;
      return bindFilters(listView);
    }

    const games = res.data;
    let body;
    if (!games.length) {
      body = `<div class="empty">
        <h2>No games coming up</h2>
        <p>${state.sport || state.hasSpots ? 'Nothing matches these filters yet.' : 'Be the first to get people playing.'}</p>
        <a class="button" href="#/new">Post a game</a>
      </div>`;
    } else {
      // Group by day, in Wollongong time
      const groups = [];
      for (const game of games) {
        const date = new Date(game.startsAt);
        const key = dayKey(date);
        if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, date, games: [] });
        groups[groups.length - 1].games.push(game);
      }
      body = groups.map((group) => `
        <h2 class="day">${dayLabel(group.date)}</h2>
        <ul class="games">${group.games.map((game) => gameRowHtml(game)).join('')}</ul>`).join('');
    }

    app.innerHTML = `<h1 class="visually-hidden">Upcoming games</h1>${filtersHtml()}${body}`;
    bindFilters(listView);
  }

  async function mapView() {
    document.title = 'Map: GongGo';
    app.classList.add('full-bleed');
    app.innerHTML = `<h1 class="visually-hidden">Games on a map</h1><div id="big-map" class="big-map"></div>`;

    const map = makeMap(document.getElementById('big-map')).setView(WOLLONGONG, 12);
    const seq = routeSeq;
    const res = await loadGames();
    if (isStale(seq)) return;
    if (!res.ok) return toast(errorText(res.data));

    const markers = res.data.map((game) => {
      const { time, period } = timeParts(new Date(game.startsAt));
      return L.marker([game.location.lat, game.location.lng], { icon: pinIcon(game), title: game.title, alt: game.title })
        .bindPopup(`<p class="popup-title">${esc(game.title)}</p>
          <div>${esc(dayLabel(new Date(game.startsAt)))}, ${time}${period}</div>
          <div>${esc(game.location.name)}</div>
          <p><a href="#/game/${esc(game.id)}">View game</a></p>`)
        .addTo(map);
    });
    if (markers.length) map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2), { maxZoom: 14 });
  }

  async function detailView(id, { justJoined = false } = {}) {
    const seq = routeSeq;
    const res = await api(`/games/${encodeURIComponent(id)}`);
    if (isStale(seq)) return;
    if (!res.ok) {
      document.title = 'Game not found: GongGo';
      app.innerHTML = `<a class="back" href="#/">All games</a>
        <div class="empty"><h2>This game isn't available</h2>
        <p>It may have been cancelled or removed.</p><a class="button" href="#/">See other games</a></div>`;
      return;
    }

    const game = res.data;
    const me = profile;
    const isHost = !!me && me.id === game.hostId;
    const isIn = !!me && game.players.some((p) => p.id === me.id);
    const over = new Date(game.endsAt) <= new Date();
    const onNow = isOnNow(game);
    const cancelled = game.status === 'cancelled';
    document.title = `${game.title}: GongGo`;

    let action;
    if (cancelled) action = '<p>This game was cancelled.</p>';
    else if (over) action = '<p>This game has finished.</p>';
    else if (isHost) {
      action = `<a class="button quiet" href="#/game/${esc(game.id)}/edit">Edit game</a>
        <button type="button" class="button danger" data-action="cancel">Cancel game</button>`;
    }
    else if (isIn) action = `<button type="button" class="button quiet" data-action="leave">Leave game</button>`;
    else if (game.spotsLeft === 0) action = '<button type="button" class="button" disabled>Game full</button>';
    else action = '<button type="button" class="button" data-action="join">Join game</button>';

    app.innerHTML = `<article class="detail">
      <a class="back" href="#/">All games</a>
      <div class="detail-sport">${esc(SPORTS[game.sport] || game.sport)}</div>
      <h1 tabindex="-1">${esc(game.title)}</h1>
      ${onNow && !cancelled ? '<p class="on-now-banner"><span class="status-tag on-now">On now</span> Running late? You can still join.</p>' : ''}
      <dl class="facts">
        <dt>When</dt><dd data-testid="when">${esc(whenRange(game))}${game.updatedAt ? ' <span class="tag">(details updated)</span>' : ''}</dd>
        <dt>Where</dt><dd>${esc(game.location.name)}</dd>
      </dl>
      <div id="mini-map" class="mini-map" role="img" aria-label="Map showing ${esc(game.location.name)}"></div>
      ${game.description ? `<p class="description">${esc(game.description)}</p>` : ''}
      <h2>Who's coming</h2>
      ${rosterHtml(game, { large: true })}
      <ul class="players" data-testid="players">
        ${game.players.map((p) => `<li>${esc(playerName(p))}${p.id === game.hostId ? ' <span class="tag">host</span>' : ''}${
          isHost && p.id !== game.hostId && !over && !cancelled
            ? ` <button type="button" class="link-button remove-player" data-remove="${esc(p.id)}" data-name="${esc(p.name)}" aria-label="Remove ${esc(p.name)}">Remove</button>`
            : ''}</li>`).join('')}
      </ul>
      ${!cancelled ? '<button type="button" class="button quiet share-button" id="share-game">Share game</button>' : ''}
      <div class="action-bar">${action}</div>
      <section class="comments" aria-labelledby="comments-title">
        <h2 id="comments-title">Comments</h2>
        <div id="comments-body">${isIn ? '<p class="muted">Loading comments...</p>'
          : '<p class="muted" data-testid="comments-locked">Join this game to see and post comments.</p>'}</div>
      </section>
      ${!isHost && !cancelled ? `<details class="report">
        <summary>Report this game</summary>
        <form id="report-form">
          <label for="report-reason">What's wrong with it?</label>
          <textarea id="report-reason" required minlength="3" maxlength="300"></textarea>
          <button type="submit" class="button quiet">Send report</button>
        </form>
      </details>` : ''}
    </article>`;

    const mini = makeMap(document.getElementById('mini-map'), { zoomControl: false, dragging: false, scrollWheelZoom: false })
      .setView([game.location.lat, game.location.lng], 15);
    L.marker([game.location.lat, game.location.lng], { icon: pinIcon(game), title: game.location.name }).addTo(mini);

    if (justJoined && me) {
      const spots = app.querySelectorAll('.roster.large .spot.taken');
      if (spots.length) spots[spots.length - 1].classList.add('just-taken');
    }

    const button = app.querySelector('[data-action]');
    if (button) button.addEventListener('click', () => handleAction(button.dataset.action, game));

    app.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
      if (!window.confirm(`Remove ${b.dataset.name} from this game? They won't be able to join it again.`)) return;
      const r = await api(`/games/${game.id}/players/${encodeURIComponent(b.dataset.remove)}`, { method: 'DELETE' });
      toast(r.ok ? `${b.dataset.name} was removed.` : errorText(r.data));
      if (!isStale(seq)) detailView(game.id);
    }));

    const share = document.getElementById('share-game');
    if (share) share.addEventListener('click', () => shareGame(game));

    if (isIn) loadComments(game, seq);

    const report = document.getElementById('report-form');
    if (report) {
      report.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!(await requireSignIn('Sign in to report a game'))) return;
        const r = await api(`/games/${game.id}/report`, {
          method: 'POST', body: { reason: document.getElementById('report-reason').value },
        });
        toast(r.ok ? 'Report sent. Thanks for keeping GongGo friendly.' : errorText(r.data));
        if (r.ok) report.closest('details').open = false;
      });
    }
  }

  // Phones get the system share sheet (WhatsApp, Messages, Instagram...);
  // elsewhere we copy the link
  async function shareGame(game) {
    const url = `${location.origin}/#/game/${game.id}`;
    const { time, period } = timeParts(new Date(game.startsAt));
    const text = `${game.title}, ${dayLabel(new Date(game.startsAt))} ${time}${period} at ${game.location.name}. ${
      game.spotsLeft > 0 ? `${game.spotsLeft} spot${game.spotsLeft === 1 ? '' : 's'} left` : 'Waitlist only'} on GongGo:`;
    if (navigator.share) {
      try { await navigator.share({ title: game.title, text, url }); } catch { /* they closed the share sheet */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast('Link copied. Paste it anywhere to share.');
    } catch {
      window.prompt('Copy this link to share the game:', url);
    }
  }

  // "5 minutes ago", "yesterday", or a date for anything older than a week
  function ago(iso) {
    const seconds = (new Date(iso) - new Date()) / 1000;
    const rtf = new Intl.RelativeTimeFormat('en-AU', { numeric: 'auto' });
    const abs = Math.abs(seconds);
    if (abs < 60) return 'just now';
    if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
    if (abs < 7 * 86400) return rtf.format(Math.round(seconds / 86400), 'day');
    return fmt({ day: 'numeric', month: 'short' }).format(new Date(iso));
  }

  async function loadComments(game, seq) {
    const body = document.getElementById('comments-body');
    const res = await api(`/games/${game.id}/comments`);
    if (isStale(seq) || !body.isConnected) return;
    if (!res.ok) {
      body.innerHTML = `<p class="errors" role="alert">${esc(errorText(res.data))}</p>`;
      return;
    }

    const list = res.data.length
      ? `<ol class="comment-list" data-testid="comments">${res.data.map((c) => `<li class="comment">
          <div class="comment-meta">
            <strong>${esc(c.userId === profile.id ? `${c.authorName} (you)` : c.authorName)}</strong>
            ${c.isHost ? '<span class="tag">host</span>' : ''}
            <time datetime="${esc(c.createdAt)}">${esc(ago(c.createdAt))}</time>
            ${c.canDelete ? `<button type="button" class="link-button" data-delete="${esc(c.id)}">Delete</button>` : ''}
          </div>
          <p class="comment-body">${esc(c.body)}</p>
        </li>`).join('')}</ol>`
      : '<p class="muted">No comments yet. Ask a question or say hi.</p>';

    body.innerHTML = `${list}
      <form class="comment-form" id="comment-form">
        <label for="comment-text">Write a comment</label>
        <textarea id="comment-text" maxlength="500" placeholder="Running late? Need a lift? Say it here."></textarea>
        <button type="submit" class="button">Post comment</button>
      </form>`;

    document.getElementById('comment-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = document.getElementById('comment-text').value.trim();
      if (!text) return toast('Write something first.');
      const r = await api(`/games/${game.id}/comments`, { method: 'POST', body: { body: text } });
      if (!r.ok) return toast(errorText(r.data));
      toast('Comment posted.');
      loadComments(game, routeSeq);
    });

    body.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
      if (!window.confirm('Delete this comment?')) return;
      const r = await api(`/games/${game.id}/comments/${b.dataset.delete}`, { method: 'DELETE' });
      toast(r.ok ? 'Comment deleted.' : errorText(r.data));
      loadComments(game, routeSeq);
    }));
  }

  async function handleAction(action, game) {
    const titles = { join: 'Sign in to join this game', leave: 'Sign in to GongGo', cancel: 'Sign in to GongGo' };
    if (!(await requireSignIn(titles[action]))) return;

    if (action === 'cancel' && !window.confirm('Cancel this game? Everyone who joined will lose their spot.')) return;

    const calls = {
      join: () => api(`/games/${game.id}/join`, { method: 'POST' }),
      leave: () => api(`/games/${game.id}/join`, { method: 'DELETE' }),
      cancel: () => api(`/games/${game.id}`, { method: 'DELETE' }),
    };
    const messages = { join: "You're in.", leave: "You've left the game.", cancel: 'Game cancelled.' };

    const seq = routeSeq;
    const res = await calls[action]();
    toast(res.ok ? messages[action] : errorText(res.data));
    if (!isStale(seq)) await detailView(game.id, { justJoined: res.ok && action === 'join' });
    if (res.ok && action === 'join') {
      // They're in: take them to the comments box so they can say hi
      const comments = document.getElementById('comments-title');
      if (comments) comments.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // A friendly card for pages that need an account
  function signInCard(heading, text, title) {
    app.innerHTML = `<div class="prompt-card">
      <h1 tabindex="-1">${esc(heading)}</h1>
      <p>${esc(text)}</p>
      <button type="button" class="button" id="card-sign-in">Sign in</button>
    </div>`;
    document.getElementById('card-sign-in').addEventListener('click', async () => {
      if (await requireSignIn(title)) route();
    });
  }

  async function meView() {
    document.title = 'My games: GongGo';
    if (!profile) {
      return signInCard('Sign in to see your games',
        "Games you're hosting or have joined show up here.", 'Sign in to see your games');
    }

    const seq = routeSeq;
    const res = await api('/me/games');
    if (isStale(seq)) return;
    if (!res.ok) {
      app.innerHTML = `<h1 tabindex="-1">My games</h1><div class="errors" role="alert">${esc(errorText(res.data))}</div>`;
      return;
    }

    const { upcoming, past, historyDays } = res.data;
    const tagFor = (game, isPast) => {
      if (game.status === 'cancelled') return '<span class="status-tag cancelled">Cancelled</span>';
      if (game.role === 'host') return `<span class="status-tag hosting">${isPast ? 'You hosted' : "You're hosting"}</span>`;
      return isPast ? '<span class="status-tag">Played</span>' : '';
    };
    const list = (games, isPast) => `<ul class="games" data-testid="${isPast ? 'past-games' : 'upcoming-games'}">
      ${games.map((g) => gameRowHtml(g, { withDate: true, tag: tagFor(g, isPast) })).join('')}</ul>`;

    app.innerHTML = `<div class="me-head">
        <h1 tabindex="-1">My games</h1>
        <p>Playing as <strong>${esc(profile.name || 'you')}</strong>.
          <button type="button" class="link-button" id="rename">Change name</button>
          <button type="button" class="link-button" id="sign-out">Sign out</button></p>
      </div>
      <h2 class="day">Coming up</h2>
      ${upcoming.length ? list(upcoming, false) : '<p class="muted">Nothing coming up. <a href="#/">Find a game</a></p>'}
      <h2 class="day">Last ${historyDays} days</h2>
      ${past.length ? list(past, true) : `<p class="muted">No games in the last ${historyDays} days.</p>`}`;

    document.getElementById('rename').addEventListener('click', async () => {
      if (await askName({ current: profile.name || '' })) {
        renderTopbar();
        toast('Name changed.');
        meView();
      }
    });
    document.getElementById('sign-out').addEventListener('click', signOutNow);
  }

  const DURATIONS = [[30, '30 minutes'], [45, '45 minutes'], [60, '1 hour'], [90, '1½ hours'],
    [120, '2 hours'], [180, '3 hours'], [240, '4 hours'], [360, '6 hours'], [480, '8 hours']];

  // datetime-local inputs want "YYYY-MM-DDTHH:MM" in the browser's own time
  function localInputValue(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  // Posting a new game, or (with editId) editing one you host
  async function formView(editId = null) {
    const editing = !!editId;
    document.title = `${editing ? 'Edit game' : 'Post a game'}: GongGo`;
    if (!profile || !profile.name) {
      return signInCard('Sign in to post a game',
        'Hosting is free. Sign in so players know who is running the game.', 'Sign in to post a game');
    }

    let game = null;
    if (editing) {
      const seq = routeSeq;
      const res = await api(`/games/${encodeURIComponent(editId)}`);
      if (isStale(seq)) return;
      if (!res.ok || res.data.hostId !== profile.id) {
        app.innerHTML = `<a class="back" href="#/">All games</a>
          <div class="empty"><h2>You can't edit this game</h2><p>Only the host can change a game's details.</p></div>`;
        return;
      }
      game = res.data;
    }

    const v = game || { title: '', sport: 'soccer', capacity: 10, durationMinutes: 90, description: '', location: { name: '' } };
    const startValue = game ? localInputValue(new Date(game.startsAt)) : '';
    const started = game && new Date(game.startsAt) <= new Date();
    const minCapacity = game ? Math.max(2, game.playerCount) : 2;

    app.innerHTML = `<form class="form" id="game-form" novalidate>
      <a class="back" href="${editing ? `#/game/${esc(game.id)}` : '#/'}">${editing ? 'Back to game' : 'All games'}</a>
      <h1 tabindex="-1">${editing ? 'Edit game' : 'Post a game'}</h1>
      <p class="hint">${editing
        ? 'Everyone who has joined keeps their spot.'
        : "You can host up to two upcoming games at a time. You'll take the first spot."}</p>
      <div id="form-errors"></div>

      <div class="field">
        <label for="f-title">What's the game?</label>
        <input id="f-title" name="title" required minlength="3" maxlength="80" placeholder="7-a-side social" value="${esc(v.title)}">
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-sport">Sport</label>
          <select id="f-sport" name="sport" required>
            ${Object.entries(SPORTS).map(([val, l]) => `<option value="${val}"${val === v.sport ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="f-capacity">Players</label>
          <input id="f-capacity" name="capacity" type="number" inputmode="numeric" min="${minCapacity}" max="100" value="${v.capacity}" required>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-when">When</label>
          <input id="f-when" name="startsAt" type="datetime-local" value="${startValue}"
            ${started ? '' : `min="${localInputValue(new Date(Date.now() + 5 * 60 * 1000))}"`} required>
        </div>
        <div class="field">
          <label for="f-duration">How long</label>
          <select id="f-duration" name="durationMinutes">
            ${DURATIONS.map(([m, l]) => `<option value="${m}"${m === v.durationMinutes ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label for="f-place">Place name</label>
        <input id="f-place" name="place" required maxlength="80" placeholder="Stuart Park, North Wollongong" value="${esc(v.location.name)}">
      </div>
      <div class="field">
        <span class="label" id="pin-label">Pin it on the map</span>
        <div id="pick-map" class="pick-map" aria-labelledby="pin-label"></div>
        <p class="pick-status${game ? ' done' : ''}" id="pick-status">${game ? 'Tap the map to move the pin.' : 'Tap the map where people should meet.'}</p>
      </div>
      <div class="field">
        <label for="f-desc">Anything else? <span class="tag">(optional)</span></label>
        <textarea id="f-desc" name="description" maxlength="500" placeholder="All levels welcome. Bring a light and a dark shirt.">${esc(v.description)}</textarea>
      </div>
      <button type="submit" class="button">${editing ? 'Save changes' : 'Post game'}</button>
    </form>`;

    let pin = null;
    const map = makeMap(document.getElementById('pick-map')).setView(game ? [game.location.lat, game.location.lng] : WOLLONGONG, game ? 15 : 12);
    if (game) pin = L.marker([game.location.lat, game.location.lng], { title: 'Meeting point' }).addTo(map);
    map.on('click', (event) => {
      if (pin) pin.setLatLng(event.latlng);
      else pin = L.marker(event.latlng, { title: 'Meeting point' }).addTo(map);
      const status = document.getElementById('pick-status');
      status.textContent = 'Pin dropped. Tap again to move it.';
      status.classList.add('done');
    });

    document.getElementById('game-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorsEl = document.getElementById('form-errors');
      const f = event.target;
      const problems = [];
      if (!f.startsAt.value) problems.push('Choose when the game starts');
      if (!pin) problems.push('Tap the map to show where to meet');
      if (problems.length) return showErrors(errorsEl, problems);

      const { lat, lng } = pin.getLatLng();
      const body = {
        title: f.title.value,
        sport: f.sport.value,
        capacity: Number(f.capacity.value),
        startsAt: new Date(f.startsAt.value).toISOString(),
        durationMinutes: Number(f.durationMinutes.value),
        description: f.description.value,
        location: { name: f.place.value, lat, lng },
      };
      // When editing, an unchanged start time is sent as the original exact time,
      // so a game that has already started can still have its details fixed
      if (game && f.startsAt.value === startValue) body.startsAt = game.startsAt;

      const seq = routeSeq;
      const res = await api(editing ? `/games/${game.id}` : '/games', { method: editing ? 'PATCH' : 'POST', body });

      if (!res.ok) {
        const list = res.data.errors || [res.data.error || 'Something went wrong. Try again.'];
        const extra = res.data.gameIds ? '<p><a href="#/me">See my games</a></p>' : '';
        return showErrors(errorsEl, list, extra);
      }
      toast(editing ? 'Changes saved.' : 'Game posted.');
      if (!isStale(seq)) location.hash = `#/game/${res.data.id}`; // don't move someone who has already left
    });
  }

  function showErrors(el, list, extra = '') {
    el.innerHTML = `<div class="errors" role="alert"><ul>${list.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>${extra}</div>`;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---------------------------------------------------------------- router

  async function route() {
    routeSeq += 1;
    const seq = routeSeq;
    destroyMaps();
    app.classList.remove('full-bleed');
    document.body.classList.remove('on-detail', 'on-form');

    const hash = location.hash.replace(/^#/, '') || '/';
    const view = hash === '/' ? 'list' : hash === '/map' ? 'map' : hash === '/me' ? 'me' : '';
    document.querySelectorAll('[data-view]').forEach((a) => {
      if (a.dataset.view === view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    const editMatch = hash.match(/^\/game\/([^/]+)\/edit$/);
    const gameMatch = hash.match(/^\/game\/([^/]+)$/);
    if (editMatch) {
      document.body.classList.add('on-form');
      await formView(decodeURIComponent(editMatch[1]));
    } else if (gameMatch) {
      document.body.classList.add('on-detail');
      await detailView(decodeURIComponent(gameMatch[1]));
    } else if (hash === '/new') {
      document.body.classList.add('on-form');
      await formView();
    } else if (hash === '/map') {
      await mapView();
    } else if (hash === '/me') {
      await meView();
    } else {
      await listView();
    }

    if (isStale(seq)) return; // another page change happened while this one loaded

    // Move focus to the new page's heading for screen reader and keyboard users
    const heading = app.querySelector('h1[tabindex]');
    (heading || app).focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  document.getElementById('sign-in-button').addEventListener('click', async () => {
    if (await requireSignIn('Sign in to GongGo')) {
      toast("You're signed in.");
      route();
    }
  });

  accountButton().addEventListener('click', () => {
    if (accountButton().getAttribute('aria-expanded') === 'true') closeAccountMenu();
    else openAccountMenu();
  });
  // Close on Escape (back to the button), on a click elsewhere, or after choosing
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAccountMenu({ focusButton: true });
  });
  document.addEventListener('click', (event) => {
    if (!document.getElementById('account').contains(event.target)) closeAccountMenu();
  });
  accountMenu().querySelector('a').addEventListener('click', () => closeAccountMenu());
  document.getElementById('menu-sign-out').addEventListener('click', signOutNow);
  document.getElementById('menu-rename').addEventListener('click', async () => {
    closeAccountMenu();
    if (await askName({ current: (profile && profile.name) || '' })) {
      renderTopbar();
      toast('Name changed.');
      route(); // redraw so "(you)" labels pick up the new name
    }
  });

  window.addEventListener('hashchange', route);

  (async function start() {
    const result = await Auth.init(); // finishes a Cognito sign-in if we just came back from one
    await loadProfile();
    renderTopbar();
    if (result && result.error) toast(result.error);
    if (result && result.signedIn && profile) {
      if (!profile.name) await askName();
      toast("You're signed in.");
    }
    route();
  })();
})();
