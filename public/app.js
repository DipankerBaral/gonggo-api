// GongGo front end. Plain JavaScript, no build step: the browser runs this file as is.
// Routes (after the # in the URL):
//   #/            list of upcoming games
//   #/map         the same games on a map
//   #/game/<id>   one game: details, who's coming, join or leave
//   #/new         post a game
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

  // ---------------------------------------------------------------- the user

  // No real accounts yet: a first name plus a short random tag, kept in this
  // browser, sent to the API as x-user-id. Real logins come later.
  function getUser() {
    try {
      return JSON.parse(localStorage.getItem('gonggo:user')) || null;
    } catch {
      return null;
    }
  }

  function saveUser(name) {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'player';
    const tag = Math.random().toString(16).slice(2, 6).padEnd(4, '0');
    const user = { id: `${slug}-${tag}`, name: name.trim() };
    try { localStorage.setItem('gonggo:user', JSON.stringify(user)); } catch { /* private mode */ }
    renderMe();
    return user;
  }

  // "sam-3f2a" -> "Sam", "seed-priya" -> "Priya"
  function displayName(userId) {
    const me = getUser();
    if (me && me.id === userId) return `${me.name} (you)`;
    const base = String(userId).replace(/^seed-/, '').replace(/-[0-9a-f]{4}$/, '').replace(/-/g, ' ');
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  function renderMe() {
    const button = document.getElementById('me-button');
    const user = getUser();
    button.hidden = !user;
    if (user) {
      button.textContent = user.name;
      button.setAttribute('aria-label', `Signed in as ${user.name}. Change name`);
    }
  }

  // Resolves with the user, asking for a name first if needed
  function requireUser() {
    const existing = getUser();
    if (existing) return Promise.resolve(existing);

    const dialog = document.getElementById('name-dialog');
    const form = document.getElementById('name-form');
    const input = document.getElementById('name-input');
    input.value = '';

    return new Promise((resolve) => {
      const done = (user) => {
        form.removeEventListener('submit', onSubmit);
        document.getElementById('name-cancel').removeEventListener('click', onCancel);
        dialog.close();
        resolve(user);
      };
      const onSubmit = (event) => {
        event.preventDefault();
        if (input.value.trim()) done(saveUser(input.value));
      };
      const onCancel = () => done(null);
      form.addEventListener('submit', onSubmit);
      document.getElementById('name-cancel').addEventListener('click', onCancel);
      dialog.showModal();
      input.focus();
    });
  }

  // ---------------------------------------------------------------- the API

  async function api(path, { method = 'GET', body, user } = {}) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (user) headers['x-user-id'] = user.id;
    try {
      const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
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

  async function loadGames() {
    const params = new URLSearchParams();
    if (state.sport) params.set('sport', state.sport);
    if (state.hasSpots) params.set('hasSpots', 'true');
    return api(`/games${params.toString() ? `?${params}` : ''}`);
  }

  // ---------------------------------------------------------------- views

  async function listView() {
    document.title = 'GongGo: pickup games around Wollongong';
    const res = await loadGames();

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
        <ul class="games">
          ${group.games.map((game) => {
            const { time, period } = timeParts(new Date(game.startsAt));
            return `<li><a class="game" href="#/game/${esc(game.id)}" data-testid="game-row">
              <div class="game-time">${time}<small>${period}</small></div>
              <div>
                <div class="game-sport">${esc(SPORTS[game.sport] || game.sport)}</div>
                <h3 class="game-title">${esc(game.title)}</h3>
                <div class="game-place">${esc(game.location.name)}</div>
              </div>
              ${rosterHtml(game)}
            </a></li>`;
          }).join('')}
        </ul>`).join('');
    }

    app.innerHTML = `<h1 class="visually-hidden">Upcoming games</h1>${filtersHtml()}${body}`;
    bindFilters(listView);
  }

  async function mapView() {
    document.title = 'Map: GongGo';
    app.classList.add('full-bleed');
    app.innerHTML = `<h1 class="visually-hidden">Games on a map</h1><div id="big-map" class="big-map"></div>`;

    const map = makeMap(document.getElementById('big-map')).setView(WOLLONGONG, 12);
    const res = await loadGames();
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
    const res = await api(`/games/${encodeURIComponent(id)}`);
    if (!res.ok) {
      document.title = 'Game not found: GongGo';
      app.innerHTML = `<a class="back" href="#/">All games</a>
        <div class="empty"><h2>This game isn't available</h2>
        <p>It may have been cancelled or removed.</p><a class="button" href="#/">See other games</a></div>`;
      return;
    }

    const game = res.data;
    const me = getUser();
    const isHost = me && me.id === game.hostId;
    const isIn = me && game.players.includes(me.id);
    const started = new Date(game.startsAt) <= new Date();
    const cancelled = game.status === 'cancelled';
    document.title = `${game.title}: GongGo`;

    let action;
    if (cancelled) action = '<p>This game was cancelled.</p>';
    else if (started) action = '<p>This game has already started.</p>';
    else if (isHost) action = `<p>You're hosting.</p><button type="button" class="button danger" data-action="cancel">Cancel game</button>`;
    else if (isIn) action = `<button type="button" class="button quiet" data-action="leave">Leave game</button>`;
    else if (game.spotsLeft === 0) action = '<button type="button" class="button" disabled>Game full</button>';
    else action = '<button type="button" class="button" data-action="join">Join game</button>';

    app.innerHTML = `<article class="detail">
      <a class="back" href="#/">All games</a>
      <div class="detail-sport">${esc(SPORTS[game.sport] || game.sport)}</div>
      <h1 tabindex="-1">${esc(game.title)}</h1>
      <dl class="facts">
        <dt>When</dt><dd>${esc(whenLong(new Date(game.startsAt)))}</dd>
        <dt>Where</dt><dd>${esc(game.location.name)}</dd>
      </dl>
      <div id="mini-map" class="mini-map" role="img" aria-label="Map showing ${esc(game.location.name)}"></div>
      ${game.description ? `<p class="description">${esc(game.description)}</p>` : ''}
      <h2>Who's coming</h2>
      ${rosterHtml(game, { large: true })}
      <ul class="players" data-testid="players">
        ${game.players.map((p) => `<li>${esc(displayName(p))}${p === game.hostId ? ' <span class="tag">host</span>' : ''}</li>`).join('')}
      </ul>
      <div class="action-bar">${action}</div>
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

    const report = document.getElementById('report-form');
    if (report) {
      report.addEventListener('submit', async (event) => {
        event.preventDefault();
        const user = await requireUser();
        if (!user) return;
        const r = await api(`/games/${game.id}/report`, {
          method: 'POST', user, body: { reason: document.getElementById('report-reason').value },
        });
        toast(r.ok ? 'Report sent. Thanks for keeping GongGo friendly.' : errorText(r.data));
        if (r.ok) report.closest('details').open = false;
      });
    }
  }

  async function handleAction(action, game) {
    const user = await requireUser();
    if (!user) return;

    if (action === 'cancel' && !window.confirm('Cancel this game? Everyone who joined will lose their spot.')) return;

    const calls = {
      join: () => api(`/games/${game.id}/join`, { method: 'POST', user }),
      leave: () => api(`/games/${game.id}/join`, { method: 'DELETE', user }),
      cancel: () => api(`/games/${game.id}`, { method: 'DELETE', user }),
    };
    const messages = { join: "You're in.", leave: "You've left the game.", cancel: 'Game cancelled.' };

    const res = await calls[action]();
    toast(res.ok ? messages[action] : errorText(res.data));
    await detailView(game.id, { justJoined: res.ok && action === 'join' });
  }

  function formView() {
    document.title = 'Post a game: GongGo';
    const now = new Date(Date.now() + 5 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const localMin = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

    app.innerHTML = `<form class="form" id="game-form" novalidate>
      <a class="back" href="#/">All games</a>
      <h1 tabindex="-1">Post a game</h1>
      <p class="hint">You can have one upcoming game at a time. You'll take the first spot.</p>
      <div id="form-errors"></div>

      <div class="field">
        <label for="f-title">What's the game?</label>
        <input id="f-title" name="title" required minlength="3" maxlength="80" placeholder="7-a-side social">
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-sport">Sport</label>
          <select id="f-sport" name="sport" required>
            ${Object.entries(SPORTS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="f-capacity">Players</label>
          <input id="f-capacity" name="capacity" type="number" inputmode="numeric" min="2" max="100" value="10" required>
        </div>
      </div>
      <div class="field">
        <label for="f-when">When</label>
        <input id="f-when" name="startsAt" type="datetime-local" min="${localMin}" required>
      </div>
      <div class="field">
        <label for="f-place">Place name</label>
        <input id="f-place" name="place" required maxlength="80" placeholder="Stuart Park, North Wollongong">
      </div>
      <div class="field">
        <span class="label" id="pin-label">Pin it on the map</span>
        <div id="pick-map" class="pick-map" aria-labelledby="pin-label"></div>
        <p class="pick-status" id="pick-status">Tap the map where people should meet.</p>
      </div>
      <div class="field">
        <label for="f-desc">Anything else? <span class="tag">(optional)</span></label>
        <textarea id="f-desc" name="description" maxlength="500" placeholder="All levels welcome. Bring a light and a dark shirt."></textarea>
      </div>
      <button type="submit" class="button">Post game</button>
    </form>`;

    let pin = null;
    const map = makeMap(document.getElementById('pick-map')).setView(WOLLONGONG, 12);
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

      const user = await requireUser();
      if (!user) return;

      const { lat, lng } = pin.getLatLng();
      const res = await api('/games', {
        method: 'POST',
        user,
        body: {
          title: f.title.value,
          sport: f.sport.value,
          capacity: Number(f.capacity.value),
          startsAt: new Date(f.startsAt.value).toISOString(),
          description: f.description.value,
          location: { name: f.place.value, lat, lng },
        },
      });

      if (!res.ok) {
        const list = res.data.errors || [res.data.error || 'Something went wrong. Try again.'];
        const extra = res.data.gameId ? `<p><a href="#/game/${esc(res.data.gameId)}">See your current game</a></p>` : '';
        return showErrors(errorsEl, list, extra);
      }
      toast('Game posted.');
      location.hash = `#/game/${res.data.id}`;
    });
  }

  function showErrors(el, list, extra = '') {
    el.innerHTML = `<div class="errors" role="alert"><ul>${list.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>${extra}</div>`;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---------------------------------------------------------------- router

  async function route() {
    destroyMaps();
    app.classList.remove('full-bleed');
    document.body.classList.remove('on-detail', 'on-form');

    const hash = location.hash.replace(/^#/, '') || '/';
    const view = hash.startsWith('/map') ? 'map' : 'list';
    document.querySelectorAll('.view-toggle a').forEach((a) => {
      if (a.dataset.view === view && !hash.startsWith('/game') && !hash.startsWith('/new')) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    const gameMatch = hash.match(/^\/game\/([^/]+)$/);
    if (gameMatch) {
      document.body.classList.add('on-detail');
      await detailView(decodeURIComponent(gameMatch[1]));
    } else if (hash === '/new') {
      document.body.classList.add('on-form');
      formView();
    } else if (hash === '/map') {
      await mapView();
    } else {
      await listView();
    }

    // Move focus to the new page's heading for screen reader and keyboard users
    const heading = app.querySelector('h1[tabindex]');
    (heading || app).focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  document.getElementById('me-button').addEventListener('click', async () => {
    const user = getUser();
    const name = window.prompt('Change your name', user ? user.name : '');
    if (name && name.trim()) {
      // Keep the same id so games you've joined still count as yours
      const updated = { ...user, name: name.trim() };
      try { localStorage.setItem('gonggo:user', JSON.stringify(updated)); } catch { /* ignore */ }
      renderMe();
      route();
    }
  });

  window.addEventListener('hashchange', route);
  renderMe();
  route();
})();
