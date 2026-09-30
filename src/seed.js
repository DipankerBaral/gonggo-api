// Sample Wollongong games so there's something to see on startup.
// Coordinates are approximate. Turn off with SEED=false (the tests will do this).
const store = require('./store');

function daysFromNow(days, hour) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

module.exports = function seed() {
  store.createGame({
    hostId: 'seed-sam', type: 'casual', sport: 'soccer', capacity: 14,
    title: 'Sunday 7-a-side', description: 'Friendly, all levels. Bring a light and a dark shirt.',
    startsAt: daysFromNow(3, 9),
    location: { name: 'Stuart Park, North Wollongong', lat: -34.4128, lng: 150.8975 },
  });
  store.createGame({
    hostId: 'seed-priya', type: 'casual', sport: 'running', capacity: 20,
    title: 'Sunrise 5k along the coast', description: 'Easy pace, coffee after.',
    startsAt: daysFromNow(2, 6),
    location: { name: 'North Beach Pavilion', lat: -34.4175, lng: 150.9005 },
  });
  store.createGame({
    hostId: 'seed-leo', type: 'casual', sport: 'basketball', capacity: 10,
    title: '5v5 pickup', description: 'Full court, runs until 8.',
    startsAt: daysFromNow(1, 18),
    location: { name: 'Beaton Park, Gwynneville', lat: -34.4150, lng: 150.8845 },
  });
  console.log('Seeded 3 sample games');
};
