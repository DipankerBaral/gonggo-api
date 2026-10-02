const hasStarted = (game) => new Date(game.startsAt) <= new Date();
const isOver = (game) => new Date(game.endsAt) <= new Date();
// Not finished yet: either coming up or happening right now
const isUpcoming = (game) => !isOver(game);

// What the public sees: counts, not the full player list
function toPublic(game) {
  const { players, reportCount, ...rest } = game;
  return {
    ...rest,
    playerCount: players.length,
    spotsLeft: game.capacity - players.length,
  };
}

module.exports = { isUpcoming, hasStarted, isOver, toPublic };
