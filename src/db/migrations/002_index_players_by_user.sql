-- "My games" looks up games by player. Without this index Postgres would scan
-- every row of game_players for each request; with it, it jumps straight there.
CREATE INDEX game_players_user_id_idx ON game_players (user_id);
