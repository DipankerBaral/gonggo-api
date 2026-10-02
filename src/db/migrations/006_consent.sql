-- Before using GongGo, everyone confirms they're 18 or over and accepts the
-- Terms of Use and Privacy Policy. We record THAT they confirmed, and when;
-- the date of birth itself is checked and then thrown away, never stored.
ALTER TABLE users ADD COLUMN adult_confirmed_at timestamptz;
ALTER TABLE users ADD COLUMN terms_accepted_at timestamptz;
ALTER TABLE users ADD COLUMN terms_version text; -- which version they accepted
