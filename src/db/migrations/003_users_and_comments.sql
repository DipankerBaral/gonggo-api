-- Accounts. The id is the person's permanent Cognito id (the "sub" claim):
-- it never changes, even if they change their email or name.
CREATE TABLE users (
  id            text PRIMARY KEY,
  display_name  text,              -- null until they choose a name
  email         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Comments on a game, visible to the people playing in it.
CREATE TABLE comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     uuid NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  user_id     text NOT NULL,
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX comments_game_id_created_at_idx ON comments (game_id, created_at);
