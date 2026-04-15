-- ============================================
-- PIFA Migration: Contracts, Salaries, Morale
-- ============================================

-- 1. New columns on PLAYERS
ALTER TABLE players ADD COLUMN IF NOT EXISTS contract_seasons_left integer DEFAULT 3;
ALTER TABLE players ADD COLUMN IF NOT EXISTS salary integer DEFAULT 25000;
ALTER TABLE players ADD COLUMN IF NOT EXISTS squad_role text DEFAULT NULL; -- 'essential', 'important', 'rotation'
ALTER TABLE players ADD COLUMN IF NOT EXISTS morale integer DEFAULT 75;
ALTER TABLE players ADD COLUMN IF NOT EXISTS salary_paid_this_season boolean DEFAULT false;
ALTER TABLE players ADD COLUMN IF NOT EXISTS wants_to_leave boolean DEFAULT false;
ALTER TABLE players ADD COLUMN IF NOT EXISTS contract_status text DEFAULT 'active'; -- 'active', 'free_agent', 'renewal_pending'

-- 2. New columns on SEASONS
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS transfer_window_open boolean DEFAULT false;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS contracts_decremented boolean DEFAULT false;

-- 3. New table: PLAYER_EMAILS (Player Brain / Inbox)
CREATE TABLE IF NOT EXISTS player_emails (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body text NOT NULL,
  email_type text NOT NULL DEFAULT 'general', -- complaint, apology, demand, farewell, general
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookups by club
CREATE INDEX IF NOT EXISTS idx_player_emails_club_id ON player_emails(club_id);
CREATE INDEX IF NOT EXISTS idx_player_emails_player_id ON player_emails(player_id);

-- 4. Migrate existing players to default contract values
UPDATE players SET 
  contract_seasons_left = 3,
  salary = 25000,
  morale = 75,
  salary_paid_this_season = false,
  wants_to_leave = false,
  contract_status = 'active'
WHERE contract_seasons_left IS NULL;

-- 5. Actionable emails support (promotion demands)
ALTER TABLE player_emails ADD COLUMN IF NOT EXISTS action_data jsonb DEFAULT NULL;
ALTER TABLE player_emails ADD COLUMN IF NOT EXISTS action_taken boolean DEFAULT false;
