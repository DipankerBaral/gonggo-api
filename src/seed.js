// Sample Wollongong games so there's something to see on a fresh database.
// Only runs when the games table is empty, so restarts don't create duplicates.
// Coordinates are approximate. Turn off with SEED=false.
const store = require('./store');

// Returns an ISO time for "N days from now at HH:MM in Wollongong", whatever
// timezone the server runs in (containers usually run in UTC).
function sydneyTime(daysFromNow, hour, minute = 0) {
  const target = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(target).split('-').map(Number);

  const offsetMinutes = (time) => {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Australia/Sydney', timeZoneName: 'longOffset' })
      .formatToParts(new Date(time)).find((p) => p.type === 'timeZoneName').value; // e.g. "GMT+10:00"
    const match = name.match(/GMT([+-])(\d{2}):(\d{2})/);
    return match ? (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
  };

  const guess = Date.UTC(y, m - 1, d, hour, minute);
  return new Date(guess - offsetMinutes(guess) * 60 * 1000).toISOString();
}

const SAMPLES = [
  {
    hostId: 'seed-sam', type: 'casual', sport: 'soccer', capacity: 14,
    title: '7-a-side social', description: 'Friendly, all levels. Bring a light and a dark shirt.',
    startsAt: sydneyTime(3, 9),
    location: { name: 'Stuart Park, North Wollongong', lat: -34.4128, lng: 150.8975 },
  },
  {
    hostId: 'seed-priya', type: 'casual', sport: 'running', capacity: 20,
    title: 'Sunrise 5k along the coast', description: 'Easy pace, coffee after.',
    startsAt: sydneyTime(2, 6),
    location: { name: 'North Beach Pavilion', lat: -34.4175, lng: 150.9005 },
  },
  {
    hostId: 'seed-leo', type: 'casual', sport: 'basketball', capacity: 10,
    title: '5v5 pickup', description: 'Full court, runs until 8.',
    startsAt: sydneyTime(1, 18),
    location: { name: 'Beaton Park, Gwynneville', lat: -34.4150, lng: 150.8845 },
  },
];

module.exports = async function seed() {
  if ((await store.countGames()) > 0) return;
  for (const game of SAMPLES) await store.createGameIfNoActive(game);
  console.log(`Seeded ${SAMPLES.length} sample games`);
};
