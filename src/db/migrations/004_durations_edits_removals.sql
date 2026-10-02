-- How long a game runs, and when it ends. ends_at is stored (not calculated
-- in every query) so "games that haven't finished yet" can use an index.
ALTER TABLE games ADD COLUMN duration_minutes integer NOT NULL DEFAULT 90
  CHECK (duration_minutes BETWEEN 15 AND 720);
ALTER TABLE games ADD COLUMN ends_at timestamptz;
UPDATE games SET ends_at = starts_at + make_interval(mins => duration_minutes);
ALTER TABLE games ALTER COLUMN ends_at SET NOT NULL;
CREATE INDEX games_status_ends_at_idx ON games (status, ends_at);

-- When the host last changed the details (null if never)
ALTER TABLE games ADD COLUMN updated_at timestamptz;

-- People a host removed from their game. They can't join it again.
CREATE TABLE game_removed_players (
  game_id     uuid NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  user_id     text NOT NULL,
  removed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, user_id)
);
