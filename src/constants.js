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

// How many upcoming games one person can host at once
const MAX_ACTIVE_GAMES = 2;

// How far back "My games" shows games you played in
const HISTORY_DAYS = 30;

// How long a game can run, in minutes
const MIN_DURATION = 15;
const MAX_DURATION = 720;
const DEFAULT_DURATION = 90;

// Rate limits: how many times one person can do something in a time window.
// Generous for real use, tight enough to stop a script flooding the app.
const RATE_LIMITS = {
  postGame: { max: 10, windowMinutes: 60 },
  editGame: { max: 30, windowMinutes: 60 },
  joinLeave: { max: 60, windowMinutes: 60 },
  comment: { max: 20, windowMinutes: 10 },
  report: { max: 10, windowMinutes: 60 },
  profile: { max: 20, windowMinutes: 60 },
};

const MIN_CAPACITY = 2;
const MAX_CAPACITY = 100;

module.exports = {
  SPORTS, REGION_BOUNDS, MIN_CAPACITY, MAX_CAPACITY, MAX_ACTIVE_GAMES, HISTORY_DAYS,
  MIN_DURATION, MAX_DURATION, DEFAULT_DURATION, RATE_LIMITS,
};
