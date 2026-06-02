-- 24-player-creation-requests.sql
-- DT proposes creating a new player (e.g. signing a free agent that doesn't
-- exist in the app yet); admin approves (player is actually created and
-- assigned to the DT's club) or rejects. Cycle: pending -> approved/rejected.
-- See lib/player-request-engine.ts.

CREATE TABLE IF NOT EXISTS player_creation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Identity proposed by the DT
  name text NOT NULL,
  position text NOT NULL,
  number integer,
  age integer,
  nationality text,
  photo_url text,
  -- Approval cycle
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_notes text,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  player_id uuid REFERENCES players(id) ON DELETE SET NULL, -- created on approval
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pcr_status_created ON player_creation_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcr_club ON player_creation_requests(club_id, status);

ALTER TABLE player_creation_requests DISABLE ROW LEVEL SECURITY;

-- Safety: ensure player columns used at approval time exist (these were used in
-- code but not previously migrated; idempotent).
ALTER TABLE players ADD COLUMN IF NOT EXISTS release_clause integer DEFAULT 700000;
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_one_club_man boolean DEFAULT false;
