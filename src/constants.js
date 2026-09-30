const SPORTS = [
  'soccer',
  'basketball',
  'running',
  'table-tennis',
  'tennis',
  'volleyball',
  'touch-football',
  'cricket',
  'community-event',
  'other',
];

// Rough box around the Illawarra, from Helensburgh down to Gerringong.
// Keeps GongGo local: a game pinned in Sydney CBD gets rejected.
const REGION_BOUNDS = {
  minLat: -34.8,
  maxLat: -34.15,
  minLng: 150.55,
  maxLng: 151.05,
};

const MIN_CAPACITY = 2;
const MAX_CAPACITY = 100;

module.exports = { SPORTS, REGION_BOUNDS, MIN_CAPACITY, MAX_CAPACITY };
