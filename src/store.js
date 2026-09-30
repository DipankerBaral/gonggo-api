// Postgres data store. Same job as the old in-memory version, but data now
// survives restarts. Every function is async because talking to a database
// takes time; the routes "await" them.
const { pool, withTransaction } = require('./db/pool');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (id) => typeof id === 'string' && UUID_RE.test(id);

// Every query that returns games selects the same columns, including the
// players in the order they joined.
const GAME_SELECT = `
  SELECT g.*,
         COALESCE((SELECT array_agg(p.user_id ORDER BY p.joined_at)
                   FROM game_players p WHERE p.game_id = g.id), '{}') AS players
  FROM games g`;

// Database rows use snake_case; the API uses camelCase. Convert in one place.
function toGame(row) {
  const game = {
    id: row.id,
    title: row.title,
    sport: row.sport,
    type: row.type,
    capacity: row.capacity,
    startsAt: row.starts_at.toISOString(),
    description: row.description,
    location: { name: row.location_name, lat: row.lat, lng: row.lng },
    hostId: row.host_id,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    players: row.players,
  };
  if (row.removed_reason) game.removedReason = row.removed_reason;
  if (row.report_count !== undefined) game.reportCount = row.report_count;
  return game;
}

async function getGame(id, client = pool) {
  if (!isUuid(id)) return null;
  const { rows } = await client.query(`${GAME_SELECT} WHERE g.id = $1`, [id]);
  return rows[0] ? toGame(rows[0]) : null;
}

// Creates a game unless the host already has an active one.
// The advisory lock stops the same person posting twice at the same instant
// (e.g. double-tapping "Post"), which a simple check-then-insert would allow.
async function createGameIfNoActive(data) {
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [data.hostId]);

    const existing = await client.query(
      `SELECT id FROM games
       WHERE host_id = $1 AND status IN ('open', 'pending_payment') AND starts_at > now()
       LIMIT 1`,
      [data.hostId],
    );
    if (existing.rowCount) return { existingId: existing.rows[0].id };

    const status = data.type === 'tournament' ? 'pending_payment' : 'open';
    const { rows } = await client.query(
      `INSERT INTO games (host_id, title, sport, type, capacity, starts_at, description,
                          location_name, lat, lng, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [data.hostId, data.title, data.sport, data.type, data.capacity, data.startsAt,
        data.description, data.location.name, data.location.lat, data.location.lng, status],
    );
    // The host takes the first spot
    await client.query('INSERT INTO game_players (game_id, user_id) VALUES ($1, $2)', [rows[0].id, data.hostId]);
    return { game: await getGame(rows[0].id, client) };
  });
}

async function listOpenGames({ sport, hasSpots } = {}) {
  const where = ["g.status = 'open'", 'g.starts_at > now()'];
  const params = [];
  if (sport) {
    params.push(sport);
    where.push(`g.sport = $${params.length}`);
  }
  if (hasSpots) {
    where.push('(SELECT count(*) FROM game_players p WHERE p.game_id = g.id) < g.capacity');
  }
  const { rows } = await pool.query(
    `${GAME_SELECT} WHERE ${where.join(' AND ')} ORDER BY g.starts_at ASC`,
    params,
  );
  return rows.map(toGame);
}

// Admin view: everything, most-reported first
async function listAllGamesWithReports() {
  const { rows } = await pool.query(`
    SELECT g.*,
           COALESCE((SELECT array_agg(p.user_id ORDER BY p.joined_at)
                     FROM game_players p WHERE p.game_id = g.id), '{}') AS players,
           (SELECT count(*)::int FROM reports r WHERE r.game_id = g.id) AS report_count
    FROM games g
    ORDER BY report_count DESC, g.created_at DESC`);
  return rows.map(toGame);
}

async function setStatus(id, status, removedReason = null) {
  await pool.query('UPDATE games SET status = $2, removed_reason = $3 WHERE id = $1', [id, status, removedReason]);
  return getGame(id);
}

// Adds a player only if there's still room. Locking the game row (FOR UPDATE)
// means two people grabbing the last spot at the same moment can't both get it.
// Returns the updated game, or null if the game was full.
async function addPlayerIfSpace(gameId, userId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT capacity FROM games WHERE id = $1 FOR UPDATE', [gameId]);
    const { rows: countRows } = await client.query(
      'SELECT count(*)::int AS n FROM game_players WHERE game_id = $1', [gameId]);
    if (countRows[0].n >= rows[0].capacity) return null;

    await client.query('INSERT INTO game_players (game_id, user_id) VALUES ($1, $2)', [gameId, userId]);
    return getGame(gameId, client);
  });
}

async function removePlayer(gameId, userId) {
  await pool.query('DELETE FROM game_players WHERE game_id = $1 AND user_id = $2', [gameId, userId]);
  return getGame(gameId);
}

async function hasReported(gameId, reporterId) {
  const { rowCount } = await pool.query(
    'SELECT 1 FROM reports WHERE game_id = $1 AND reporter_id = $2', [gameId, reporterId]);
  return rowCount > 0;
}

async function addReport({ gameId, reporterId, reason }) {
  const { rows } = await pool.query(
    `INSERT INTO reports (game_id, reporter_id, reason) VALUES ($1, $2, $3)
     RETURNING id, game_id AS "gameId", reporter_id AS "reporterId", reason, created_at AS "createdAt"`,
    [gameId, reporterId, reason],
  );
  return rows[0];
}

async function listReports() {
  const { rows } = await pool.query(
    `SELECT id, game_id AS "gameId", reporter_id AS "reporterId", reason, created_at AS "createdAt"
     FROM reports ORDER BY created_at DESC`);
  return rows;
}

async function banUserAndRemoveGames(userId) {
  return withTransaction(async (client) => {
    await client.query('INSERT INTO banned_users (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    const { rows } = await client.query(
      `UPDATE games SET status = 'removed', removed_reason = 'Host banned'
       WHERE host_id = $1 AND status IN ('open', 'pending_payment') AND starts_at > now()
       RETURNING id`,
      [userId],
    );
    return rows.map((r) => r.id);
  });
}

async function isBanned(userId) {
  const { rowCount } = await pool.query('SELECT 1 FROM banned_users WHERE user_id = $1', [userId]);
  return rowCount > 0;
}

async function countGames() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM games');
  return rows[0].n;
}

module.exports = {
  getGame, createGameIfNoActive, listOpenGames, listAllGamesWithReports, setStatus,
  addPlayerIfSpace, removePlayer, hasReported, addReport, listReports,
  banUserAndRemoveGames, isBanned, countGames,
};
