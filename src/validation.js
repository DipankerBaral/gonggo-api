const {
  SPORTS, REGION_BOUNDS, MIN_CAPACITY, MAX_CAPACITY, MIN_DURATION, MAX_DURATION, DEFAULT_DURATION,
} = require('./constants');

// Checks a whole game. requireFutureStart is off when a host edits a game that
// has already started without changing its time (e.g. fixing the description).
function validateGame(body, { requireFutureStart = true } = {}) {
  const b = body || {};
  const errors = [];

  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (title.length < 3 || title.length > 80) errors.push('title must be 3-80 characters');

  if (!SPORTS.includes(b.sport)) errors.push(`sport must be one of: ${SPORTS.join(', ')}`);

  const type = b.type ?? 'casual';
  if (!['casual', 'tournament'].includes(type)) errors.push("type must be 'casual' or 'tournament'");

  if (!Number.isInteger(b.capacity) || b.capacity < MIN_CAPACITY || b.capacity > MAX_CAPACITY) {
    errors.push(`capacity must be a whole number from ${MIN_CAPACITY} to ${MAX_CAPACITY}`);
  }

  const start = new Date(b.startsAt);
  if (!b.startsAt || Number.isNaN(start.getTime())) errors.push('startsAt must be a valid ISO date, e.g. 2026-10-04T09:00:00+10:00');
  else if (requireFutureStart && start <= new Date()) errors.push('startsAt must be in the future');

  const duration = b.durationMinutes ?? DEFAULT_DURATION;
  if (!Number.isInteger(duration) || duration < MIN_DURATION || duration > MAX_DURATION) {
    errors.push(`durationMinutes must be a whole number from ${MIN_DURATION} to ${MAX_DURATION}`);
  }

  const loc = b.location;
  if (!loc || typeof loc.name !== 'string' || !loc.name.trim()) errors.push('location.name is required');
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
    errors.push('location.lat and location.lng must be numbers');
  } else if (
    loc.lat < REGION_BOUNDS.minLat || loc.lat > REGION_BOUNDS.maxLat ||
    loc.lng < REGION_BOUNDS.minLng || loc.lng > REGION_BOUNDS.maxLng
  ) {
    errors.push('location must be in the Illawarra region');
  }

  if (errors.length) return { errors };

  return {
    errors,
    value: {
      title,
      sport: b.sport,
      type,
      capacity: b.capacity,
      startsAt: start.toISOString(),
      durationMinutes: duration,
      description: typeof b.description === 'string' ? b.description.trim().slice(0, 500) : '',
      location: { name: loc.name.trim(), lat: loc.lat, lng: loc.lng },
    },
  };
}

// A display name: 1-30 characters with at least one letter ("Sam", not "4333")
function validateName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 30) return { error: 'name must be 1-30 characters' };
  if (!/\p{L}/u.test(name)) return { error: 'name must include at least one letter' };
  return { name };
}

// For people without a chosen name yet (and the sample games):
// "seed-priya" -> "Priya", "sam-3f2a" -> "Sam"
function fallbackName(userId) {
  const base = String(userId).replace(/^seed-/, '').replace(/-[0-9a-f]{4,12}$/, '');
  if (!/^[a-z][a-z -]*$/i.test(base) || base.length > 20) return 'Player';
  const word = base.replace(/-/g, ' ');
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// A host's changes to an existing game: anything they leave out stays as it is.
// The type (casual or tournament) can't change.
const EDITABLE = ['title', 'sport', 'capacity', 'startsAt', 'durationMinutes', 'description', 'location'];

function validateGameEdit(body, game) {
  const b = body || {};
  const changed = EDITABLE.filter((field) => b[field] !== undefined);
  if (!changed.length) return { errors: ['nothing to change'] };

  const merged = { ...game, type: game.type };
  for (const field of changed) merged[field] = b[field];

  const timeChanged = changed.includes('startsAt') && new Date(b.startsAt).getTime() !== new Date(game.startsAt).getTime();
  const result = validateGame(merged, { requireFutureStart: timeChanged });
  if (result.errors.length) return result;

  if (result.value.capacity < game.players.length) {
    return { errors: [`capacity can't be less than the ${game.players.length} people already in the game`] };
  }
  return { errors: [], value: result.value, changed };
}

// Age on a given day, in Wollongong, from a YYYY-MM-DD date of birth.
// Returns null if the date isn't a real date.
function ageOn(dateOfBirth, today = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateOfBirth || ''));
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null; // e.g. 31 Feb

  const [ty, tm, td] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(today).split('-').map(Number);
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1; // birthday not reached yet this year
  return age;
}

module.exports = { validateGame, validateGameEdit, validateName, fallbackName, ageOn };
