const isUpcoming = (game) => new Date(game.startsAt) > new Date();

// "Active" = counts toward the one-active-post-per-person rule
const isActive = (game) => ['open', 'pending_payment'].includes(game.status) && isUpcoming(game);

// What the public sees: counts, not the full player list
function toPublic(game) {
  const { players, ...rest } = game;
  return {
    ...rest,
    playerCount: players.length,
    spotsLeft: game.capacity - players.length,
  };
}

module.exports = { isUpcoming, isActive, toPublic };
