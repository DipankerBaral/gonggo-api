-- GongGo initial schema.
-- Never edit a migration that has already run somewhere. To change the schema,
-- add a new file (002_..., 003_...) and the migrator will apply it once.

CREATE TABLE games (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id         text NOT NULL,
  title           text NOT NULL,
  sport           text NOT NULL,
  type            text NOT NULL CHECK (type IN ('casual', 'tournament')),
  capacity        integer NOT NULL CHECK (capacity >= 2),
  starts_at       timestamptz NOT NULL,
  description     text NOT NULL DEFAULT '',
  location_name   text NOT NULL,
  lat             double precision NOT NULL,
  lng             double precision NOT NULL,
  status          text NOT NULL CHECK (status IN ('open', 'pending_payment', 'cancelled', 'removed')),
  removed_reason  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX games_status_starts_at_idx ON games (status, starts_at);
CREATE INDEX games_host_id_idx ON games (host_id);

-- One row per person in a game. The primary key makes "join twice" impossible.
CREATE TABLE game_players (
  game_id    uuid NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  user_id    text NOT NULL,
  joined_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (game_id, user_id)
);

CREATE TABLE reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id      uuid NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  reporter_id  text NOT NULL,
  reason       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, reporter_id)
);

CREATE TABLE banned_users (
  user_id    text PRIMARY KEY,
  banned_at  timestamptz NOT NULL DEFAULT now()
);
