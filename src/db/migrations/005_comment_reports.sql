-- Reports about individual comments (game reports live in "reports")
CREATE TABLE comment_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id   uuid NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
  reporter_id  text NOT NULL,
  reason       text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 300),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, reporter_id)
);
