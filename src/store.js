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
    durationMinutes: row.duration_minutes,
    endsAt: row.ends_at.toISOString(),
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
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

// Creates a game unless the host already has the maximum number of active ones.
// The advisory lock stops the same person posting twice at the same instant
// (e.g. double-tapping "Post"), which a simple check-then-insert would allow.
async function createGameIfUnderLimit(data, limit) {
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [data.hostId]);

    const existing = await client.query(
      `SELECT id FROM games
       WHERE host_id = $1 AND status IN ('open', 'pending_payment') AND ends_at > now()
       ORDER BY starts_at`,
      [data.hostId],
    );
    if (existing.rowCount >= limit) return { activeIds: existing.rows.map((r) => r.id) };

    const status = data.type === 'tournament' ? 'pending_payment' : 'open';
    const { rows } = await client.query(
      `INSERT INTO games (host_id, title, sport, type, capacity, starts_at, duration_minutes, ends_at,
                          description, location_name, lat, lng, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $6::timestamptz + make_interval(mins => $7), $8, $9, $10, $11, $12)
       RETURNING id`,
      [data.hostId, data.title, data.sport, data.type, data.capacity, data.startsAt,
        data.durationMinutes || 90, data.description, data.location.name, data.location.lat, data.location.lng, status],
    );
    // The host takes the first spot
    await client.query('INSERT INTO game_players (game_id, user_id) VALUES ($1, $2)', [rows[0].id, data.hostId]);
    return { game: await getGame(rows[0].id, client) };
  });
}

async function listOpenGames({ sport, hasSpots } = {}) {
  const where = ["g.status = 'open'", 'g.ends_at > now()']; // includes games happening right now
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

// A host's edit. `value` is the full, validated game; only these columns change.
async function updateGameDetails(id, value) {
  await pool.query(
    `UPDATE games SET
       title = $2, sport = $3, capacity = $4, starts_at = $5, duration_minutes = $6,
       ends_at = $5::timestamptz + make_interval(mins => $6),
       description = $7, location_name = $8, lat = $9, lng = $10, updated_at = now()
     WHERE id = $1`,
    [id, value.title, value.sport, value.capacity, value.startsAt, value.durationMinutes,
      value.description, value.location.name, value.location.lat, value.location.lng],
  );
  return getGame(id);
}

// The host takes someone out of their game; they can't rejoin it
async function removePlayerByHost(gameId, userId) {
  return withTransaction(async (client) => {
    await client.query('DELETE FROM game_players WHERE game_id = $1 AND user_id = $2', [gameId, userId]);
    await client.query(
      'INSERT INTO game_removed_players (game_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [gameId, userId]);
  });
}

async function wasRemovedFrom(gameId, userId) {
  const { rowCount } = await pool.query(
    'SELECT 1 FROM game_removed_players WHERE game_id = $1 AND user_id = $2', [gameId, userId]);
  return rowCount > 0;
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
       WHERE host_id = $1 AND status IN ('open', 'pending_payment') AND ends_at > now()
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

// Games someone is hosting or has joined: everything upcoming, plus anything
// that started in the last `days` days. Removed games are left out.
async function listGamesForUser(userId, days) {
  const { rows } = await pool.query(
    `${GAME_SELECT}
     WHERE EXISTS (SELECT 1 FROM game_players p WHERE p.game_id = g.id AND p.user_id = $1)
       AND g.status <> 'removed'
       AND g.starts_at > now() - make_interval(days => $2)
     ORDER BY g.starts_at ASC`,
    [userId, days],
  );
  return rows.map(toGame);
}

// ---- users

// Makes sure a row exists for this person and returns it. A name they chose
// is never overwritten; a missing one is filled in from their sign-in.
async function ensureUser({ id, email, suggestedName }) {
  const { rows } = await pool.query(
    `INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, users.email),
       display_name = COALESCE(users.display_name, EXCLUDED.display_name)
     RETURNING id, display_name AS name, email, terms_version AS "termsVersion"`,
    [id, email, suggestedName],
  );
  return rows[0];
}

async function recordConsent(id, termsVersion) {
  const { rows } = await pool.query(
    `UPDATE users SET adult_confirmed_at = now(), terms_accepted_at = now(), terms_version = $2, updated_at = now()
     WHERE id = $1 RETURNING id, display_name AS name, email, terms_version AS "termsVersion"`,
    [id, termsVersion],
  );
  return rows[0];
}

async function setDisplayName(id, name) {
  const { rows } = await pool.query(
    `UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1
     RETURNING id, display_name AS name, email, terms_version AS "termsVersion"`,
    [id, name],
  );
  return rows[0] || null;
}

// The players in a game with their chosen names, in the order they joined
async function listPlayersWithNames(gameId) {
  const { rows } = await pool.query(
    `SELECT p.user_id AS id, u.display_name AS name
     FROM game_players p LEFT JOIN users u ON u.id = p.user_id
     WHERE p.game_id = $1 ORDER BY p.joined_at`,
    [gameId],
  );
  return rows;
}

// ---- comments

async function listComments(gameId) {
  const { rows } = await pool.query(
    `SELECT c.id, c.user_id AS "userId", u.display_name AS "authorName", c.body, c.created_at AS "createdAt"
     FROM comments c LEFT JOIN users u ON u.id = c.user_id
     WHERE c.game_id = $1 ORDER BY c.created_at`,
    [gameId],
  );
  return rows;
}

async function addComment(gameId, userId, body) {
  const { rows } = await pool.query(
    `INSERT INTO comments (game_id, user_id, body) VALUES ($1, $2, $3)
     RETURNING id, user_id AS "userId", body, created_at AS "createdAt"`,
    [gameId, userId, body],
  );
  return rows[0];
}

async function getComment(gameId, commentId) {
  if (!isUuid(commentId)) return null;
  const { rows } = await pool.query(
    'SELECT id, user_id AS "userId" FROM comments WHERE game_id = $1 AND id = $2', [gameId, commentId]);
  return rows[0] || null;
}

async function deleteComment(commentId) {
  await pool.query('DELETE FROM comments WHERE id = $1', [commentId]);
}

// ---- comment reports and moderation

async function getCommentInGame(gameId, commentId) {
  if (!isUuid(commentId)) return null;
  const { rows } = await pool.query(
    'SELECT id, user_id AS "userId", body FROM comments WHERE game_id = $1 AND id = $2', [gameId, commentId]);
  return rows[0] || null;
}

async function addCommentReport(commentId, reporterId, reason) {
  const { rows } = await pool.query(
    `INSERT INTO comment_reports (comment_id, reporter_id, reason) VALUES ($1, $2, $3)
     RETURNING id, comment_id AS "commentId", reason, created_at AS "createdAt"`,
    [commentId, reporterId, reason],
  );
  return rows[0];
}

// Every reported comment, with its game, author and the reasons given
async function listReportedComments() {
  const { rows } = await pool.query(`
    SELECT c.id, c.body, c.user_id AS "authorId", u.display_name AS "authorName",
           c.created_at AS "createdAt", g.id AS "gameId", g.title AS "gameTitle",
           json_agg(json_build_object('reason', r.reason, 'createdAt', r.created_at) ORDER BY r.created_at) AS reports
    FROM comment_reports r
    JOIN comments c ON c.id = r.comment_id
    JOIN games g ON g.id = c.game_id
    LEFT JOIN users u ON u.id = c.user_id
    GROUP BY c.id, u.display_name, g.id
    ORDER BY count(*) DESC, max(r.created_at) DESC`);
  return rows;
}

// Every reported game that hasn't been removed, with the reasons
async function listReportedGames() {
  const { rows } = await pool.query(`
    SELECT g.id, g.title, g.status, g.host_id AS "hostId", u.display_name AS "hostName", g.starts_at AS "startsAt",
           json_agg(json_build_object('reason', r.reason, 'createdAt', r.created_at) ORDER BY r.created_at) AS reports
    FROM reports r
    JOIN games g ON g.id = r.game_id
    LEFT JOIN users u ON u.id = g.host_id
    WHERE g.status <> 'removed'
    GROUP BY g.id, u.display_name
    ORDER BY count(*) DESC, max(r.created_at) DESC`);
  return rows;
}

async function findComment(commentId) {
  if (!isUuid(commentId)) return null;
  const { rows } = await pool.query('SELECT id, user_id AS "userId", game_id AS "gameId" FROM comments WHERE id = $1', [commentId]);
  return rows[0] || null;
}

const dismissGameReports = (gameId) => pool.query('DELETE FROM reports WHERE game_id = $1', [gameId]);
const dismissCommentReports = (commentId) => pool.query('DELETE FROM comment_reports WHERE comment_id = $1', [commentId]);

async function unbanUser(userId) {
  const { rowCount } = await pool.query('DELETE FROM banned_users WHERE user_id = $1', [userId]);
  return rowCount > 0;
}

async function listBanned() {
  const { rows } = await pool.query(`
    SELECT b.user_id AS "userId", u.display_name AS name, b.banned_at AS "bannedAt"
    FROM banned_users b LEFT JOIN users u ON u.id = b.user_id ORDER BY b.banned_at DESC`);
  return rows;
}

// ---- deleting an account: everything that belongs to this person, in one go

async function deleteUserData(userId) {
  return withTransaction(async (client) => {
    // Games they host (players, comments and reports go with them)
    const hosted = await client.query('DELETE FROM games WHERE host_id = $1 RETURNING id', [userId]);
    // Their spot in other people's games, their comments and the reports they made
    await client.query('DELETE FROM game_players WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM comments WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM comment_reports WHERE reporter_id = $1', [userId]);
    await client.query('DELETE FROM reports WHERE reporter_id = $1', [userId]);
    await client.query('DELETE FROM game_removed_players WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    // A ban (just an id) is kept on purpose, so deleting doesn't undo moderation
    return { deletedGames: hosted.rows.map((r) => r.id) };
  });
}

async function countGames() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM games');
  return rows[0].n;
}

module.exports = {
  getGame, createGameIfUnderLimit, listOpenGames, listGamesForUser,
  updateGameDetails, removePlayerByHost, wasRemovedFrom, listAllGamesWithReports, setStatus,
  addPlayerIfSpace, removePlayer, hasReported, addReport, listReports,
  banUserAndRemoveGames, isBanned, countGames,
  ensureUser, setDisplayName, recordConsent, listPlayersWithNames,
  listComments, addComment, getComment, deleteComment,
  getCommentInGame, addCommentReport, listReportedComments, listReportedGames, findComment,
  dismissGameReports, dismissCommentReports, unbanUser, listBanned, deleteUserData,
};
