-- 25-db-migration.sql
-- Helpers SECURITY DEFINER for the project-to-project migration flow.
-- Called via supabase.rpc() from /api/admin/db-import and /api/admin/db-export
-- in lib/migration-tables.ts.
--
-- Idempotent: safe to re-run; CREATE OR REPLACE preserves grants.

-- Count admins/moderators. Used by the import endpoint as a safety guard:
-- import is only allowed when the destination project has NO admin yet.
CREATE OR REPLACE FUNCTION public.migration_count_admins()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint FROM public.users WHERE role IN ('admin','moderator');
$$;

-- Toggle session_replication_role so we can insert rows in any order without
-- tripping foreign-key constraints during a bulk restore. MUST be reset back
-- to 'origin' at the end.
CREATE OR REPLACE FUNCTION public.migration_set_replication(replica boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF replica THEN
    EXECUTE 'SET session_replication_role = replica';
  ELSE
    EXECUTE 'SET session_replication_role = origin';
  END IF;
END$$;

-- TRUNCATE all known PIFA tables in cascade. Hard-coded list so we never touch
-- tables outside the app (e.g. storage.*). Keep this list in sync with
-- lib/migration-tables.ts.
CREATE OR REPLACE FUNCTION public.migration_truncate_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- Chat, social & AI-history tables (scripts/26-missing-tables.sql + the
    -- `news` table inside scripts/15-performance-indexes.sql). TRUNCATE ...
    -- CASCADE below makes order safe regardless, but listed first since
    -- they're leaves (nothing references them).
    'news','clause_negotiations','global_chat_read_status','global_chat_messages',
    'user_stickers','player_chats',
    'award_votes','season_gala_publish','season_award_weights','season_awards',
    'club_bonuses','season_prizes','player_creation_requests','match_appeals',
    'club_trophies','trophies','diffusions','user_push_tokens','market_history',
    'notifications','market_offers','match_annotations','player_competition_stats',
    'standings','matches','competition_stages','competition_clubs','competitions',
    'seasons','player_emails','players','users','clubs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Skip silently if a table doesn't exist yet (allows partial schemas).
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', t);
    END IF;
  END LOOP;
END$$;

-- Grant execute to anon and authenticated for the count function only.
-- The other two require service_role (which bypasses all grants anyway).
GRANT EXECUTE ON FUNCTION public.migration_count_admins() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.migration_set_replication(boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.migration_truncate_all() TO service_role;
