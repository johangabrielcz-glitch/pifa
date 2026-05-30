-- 22-season-prizes.sql
-- Season-end prize money system. Pays clubs once per finished season for:
--   matches won, final classification per competition (league position / cup
--   round reached), and titles (champion bonus). Amounts are per-competition,
--   admin-configurable with sensible defaults (lib/prize-engine.ts).

-- Idempotency + audit flags on the season
ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS prizes_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prizes_paid_at timestamptz;

-- Per-competition prize configuration (null => use computed defaults)
ALTER TABLE competitions
  ADD COLUMN IF NOT EXISTS prize_config jsonb;

-- Audit / breakdown of what was paid (powers the per-club breakdown display)
CREATE TABLE IF NOT EXISTS season_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  competition_id uuid REFERENCES competitions(id) ON DELETE SET NULL,
  category text NOT NULL,        -- 'match_won' | 'classification' | 'title'
  detail text NOT NULL,          -- e.g. "12 victorias", "Liga · 1º", "Copa · Campeón"
  amount numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_season_prizes_season ON season_prizes(season_id);
CREATE INDEX IF NOT EXISTS idx_season_prizes_club ON season_prizes(club_id);
