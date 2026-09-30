const isUpcoming = (game) => new Date(game.startsAt) > new Date();

// What the public sees: counts, not the full player list
function toPublic(game) {
  const { players, reportCount, ...rest } = game;
  return {
    ...rest,
    playerCount: players.length,
    spotsLeft: game.capacity - players.length,
  };
}

module.exports = { isUpcoming, toPublic };
