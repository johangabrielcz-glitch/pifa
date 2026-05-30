-- 23-club-bonuses.sql
-- Optional audit log of admin money bonuses sent to clubs (lib/bonus-engine.ts).
-- The bonus feature works without this table (audit insert is best-effort),
-- but running it keeps a history of who received what and why.

CREATE TABLE IF NOT EXISTS club_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  concept text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_club_bonuses_club ON club_bonuses(club_id);
