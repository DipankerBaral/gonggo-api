const { SPORTS, REGION_BOUNDS, MIN_CAPACITY, MAX_CAPACITY } = require('./constants');

function validateGame(body) {
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
  else if (start <= new Date()) errors.push('startsAt must be in the future');

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
      description: typeof b.description === 'string' ? b.description.trim().slice(0, 500) : '',
      location: { name: loc.name.trim(), lat: loc.lat, lng: loc.lng },
    },
  };
}

module.exports = { validateGame };
