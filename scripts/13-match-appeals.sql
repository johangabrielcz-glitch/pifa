-- =====================================================================
-- MATCH APPEALS SYSTEM
-- DT proposes an edit to a finished match. Admin must approve.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.match_appeals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    club_id  UUID NOT NULL REFERENCES public.clubs(id)   ON DELETE CASCADE,
    submitted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

    -- Snapshot of the pre-appeal state (stable diff even if other appeals modify the match)
    original_home_score INTEGER NOT NULL,
    original_away_score INTEGER NOT NULL,
    original_home_annotation JSONB,
    original_away_annotation JSONB,

    -- DT's proposal
    proposed_home_score INTEGER NOT NULL CHECK (proposed_home_score >= 0),
    proposed_away_score INTEGER NOT NULL CHECK (proposed_away_score >= 0),
    proposed_home_annotation JSONB NOT NULL,
    proposed_away_annotation JSONB NOT NULL,

    reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected')),
    admin_notes TEXT,
    resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only ONE pending appeal per (match, club). Rejected/accepted rows do not block re-appeals.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_match_appeals_pending_per_club
    ON public.match_appeals (match_id, club_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_match_appeals_status_created
    ON public.match_appeals (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_appeals_club
    ON public.match_appeals (club_id, status);
CREATE INDEX IF NOT EXISTS idx_match_appeals_match
    ON public.match_appeals (match_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.match_appeals;

-- RLS disabled (auth is custom, not Supabase Auth — same pattern as the other tables)
ALTER TABLE public.match_appeals DISABLE ROW LEVEL SECURITY;
