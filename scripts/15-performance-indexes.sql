-- =====================================================================
-- PIFA PERFORMANCE — additional indexes for the DT dashboard
-- Safe to re-run (all use CREATE INDEX IF NOT EXISTS).
-- =====================================================================

-- =====================================================================
-- TIER 1: critical indexes for the most frequent DT queries
-- =====================================================================

-- DT calendar / dashboard:
--   matches.select(...).or('home_club_id.eq.X,away_club_id.eq.X').order(match_order)
-- The .or() across two columns benefits from a composite per side.
CREATE INDEX IF NOT EXISTS idx_matches_home_club_order
  ON matches(home_club_id, match_order ASC);
CREATE INDEX IF NOT EXISTS idx_matches_away_club_order
  ON matches(away_club_id, match_order ASC);

-- Unread notifications badge:
--   notifications.select(count).eq('club_id', X).eq('is_read', false)
-- Partial index covers only unread rows (typical case = small subset).
CREATE INDEX IF NOT EXISTS idx_notifications_club_unread
  ON notifications(club_id) WHERE is_read = false;

-- Standings ordered by points DESC for competition list:
--   standings.select(...).in('competition_id', [...]).order('points', desc)
CREATE INDEX IF NOT EXISTS idx_standings_competition_points
  ON standings(competition_id, points DESC);

-- Squad list:
--   players.select(*).eq('club_id', X).order('position').order('number')
CREATE INDEX IF NOT EXISTS idx_players_club_position_number
  ON players(club_id, position, number);

-- News feed.
-- "news" is used all over the app (lib/contract-engine.ts, app/api/news/generate,
-- components/pifa/news-tab.tsx, create-news-dialog.tsx, the dashboard widget +
-- its realtime channel) but was never created by any numbered script — it only
-- exists in the live project because someone created it by hand from the
-- Supabase Dashboard. Recreated here, right before the index that depends on
-- it, so a fresh project doesn't fail with "relation news does not exist".
CREATE TABLE IF NOT EXISTS news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE, -- null for match-triggered news
  title text NOT NULL,
  content text NOT NULL,
  emoji text DEFAULT '📰',
  category text DEFAULT 'gossip', -- match | gossip | rumor (free text, no CHECK in the original)
  summary text, -- AI path stores a hex color here (item.color); manual creation leaves it null
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_news_club_id ON news(club_id);

--   news.select(...).order('created_at', desc).limit(N)
CREATE INDEX IF NOT EXISTS idx_news_created_at_desc
  ON news(created_at DESC);

-- DT inbox:
--   player_emails.select(...).eq('club_id', X).order('created_at', desc)
CREATE INDEX IF NOT EXISTS idx_player_emails_club_created
  ON player_emails(club_id, created_at DESC);

-- =====================================================================
-- TIER 2: foreign keys without indexes
-- (Supabase / Postgres do NOT auto-index FK columns.)
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_standings_club_id ON standings(club_id);
CREATE INDEX IF NOT EXISTS idx_standings_stage_id ON standings(stage_id);
CREATE INDEX IF NOT EXISTS idx_player_competition_stats_club_id ON player_competition_stats(club_id);
CREATE INDEX IF NOT EXISTS idx_matches_stage_id ON matches(stage_id);
CREATE INDEX IF NOT EXISTS idx_match_appeals_submitted_by ON match_appeals(submitted_by);
CREATE INDEX IF NOT EXISTS idx_match_appeals_resolved_by ON match_appeals(resolved_by);
CREATE INDEX IF NOT EXISTS idx_market_history_from_club_id ON market_history(from_club_id);
CREATE INDEX IF NOT EXISTS idx_market_history_to_club_id ON market_history(to_club_id);
CREATE INDEX IF NOT EXISTS idx_market_offers_previous_offer ON market_offers(previous_offer_id);
