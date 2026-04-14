-- =============================================
-- MIGRATION: Stamina, Injuries & Red Cards
-- Run this script in Supabase SQL Editor
-- =============================================

-- 1. Add stamina and injury/suspension fields to players
ALTER TABLE players ADD COLUMN IF NOT EXISTS stamina integer DEFAULT 100 NOT NULL;
ALTER TABLE players ADD COLUMN IF NOT EXISTS injury_matches_left integer DEFAULT 0 NOT NULL;
ALTER TABLE players ADD COLUMN IF NOT EXISTS injury_reason text DEFAULT NULL;
ALTER TABLE players ADD COLUMN IF NOT EXISTS red_card_matches_left integer DEFAULT 0 NOT NULL;
ALTER TABLE players ADD COLUMN IF NOT EXISTS red_card_reason text DEFAULT NULL;

-- 2. Add red card check cooldown counter to clubs (every 3 matches)
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS red_card_check_counter integer DEFAULT 0 NOT NULL;

-- 3. Ensure all existing players start at 100 stamina
UPDATE players SET stamina = 100 WHERE stamina IS NULL;
UPDATE players SET injury_matches_left = 0 WHERE injury_matches_left IS NULL;
UPDATE players SET red_card_matches_left = 0 WHERE red_card_matches_left IS NULL;

-- 4. Actualizar tipo de substitutes_in a JSONB para soportar el formato con player_in y player_out
ALTER TABLE match_annotations ALTER COLUMN substitutes_in DROP DEFAULT;
ALTER TABLE match_annotations ALTER COLUMN substitutes_in TYPE JSONB USING to_jsonb(substitutes_in);
ALTER TABLE match_annotations ALTER COLUMN substitutes_in SET DEFAULT '[]'::JSONB;
