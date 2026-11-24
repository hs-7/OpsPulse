ALTER TABLE refresh_sessions
  ADD COLUMN IF NOT EXISTS family_id uuid;

UPDATE refresh_sessions
SET family_id = id
WHERE family_id IS NULL;

ALTER TABLE refresh_sessions
  ALTER COLUMN family_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS refresh_sessions_family_idx
  ON refresh_sessions(family_id);
