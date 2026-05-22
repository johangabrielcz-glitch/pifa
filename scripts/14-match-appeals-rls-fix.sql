-- =====================================================================
-- Hotfix: disable RLS on match_appeals so the client-side pending-appeal
-- check (used by MatchDetailsDrawer to hide the "Apelar Resultado" button)
-- can read the table. Run once.
-- =====================================================================

ALTER TABLE public.match_appeals DISABLE ROW LEVEL SECURITY;
