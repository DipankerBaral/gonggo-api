// In-memory data store. Data disappears when the server restarts; that's fine for now.
// In the Docker step we'll replace this file with a Postgres version that has the
// same functions, so the routes won't need to change.
const { randomUUID } = require('crypto');

const games = new Map();
const reports = [];
const bannedUsers = new Set();

function createGame(data) {
  const game = {
    id: randomUUID(),
    ...data,
    players: [data.hostId], // the host takes the first spot
    // Tournaments stay hidden until paid for (manually approved by an admin for now)
    status: data.type === 'tournament' ? 'pending_payment' : 'open',
    createdAt: new Date().toISOString(),
  };
  games.set(game.id, game);
  return game;
}

const getGame = (id) => games.get(id) || null;
const listGames = () => [...games.values()];

function updateGame(id, changes) {
  const game = games.get(id);
  if (!game) return null;
  Object.assign(game, changes);
  return game;
}

function addPlayer(gameId, userId) {
  const game = games.get(gameId);
  game.players.push(userId);
  return game;
}

function removePlayer(gameId, userId) {
  const game = games.get(gameId);
  game.players = game.players.filter((p) => p !== userId);
  return game;
}

function addReport(data) {
  const report = { id: randomUUID(), ...data, createdAt: new Date().toISOString() };
  reports.push(report);
  return report;
}

const listReports = () => [...reports];
const banUser = (userId) => bannedUsers.add(userId);
const isBanned = (userId) => bannedUsers.has(userId);

function reset() {
  games.clear();
  reports.length = 0;
  bannedUsers.clear();
}

module.exports = {
  createGame, getGame, listGames, updateGame, addPlayer, removePlayer,
  addReport, listReports, banUser, isBanned, reset,
};
