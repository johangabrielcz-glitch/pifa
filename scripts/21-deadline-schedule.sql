-- 21-deadline-schedule.sql
-- Adds per-season deadline scheduling config consumed by the unified
-- deadline engine (lib/match-engine.ts computeSeasonSchedule) and the
-- admin calendar preview.
--
-- Model:
--   deadline_anchor      NULL  => deadlines are relative to activation time (now)
--                        set   => fixed base time; survives re-activation
--   deadline_gap_hours         => hours between consecutive day-slots (default 24)
--   deadline_overrides         => JSON map slotKey ("category-matchday-leg") -> ISO deadline
--                                 for per-matchday manual overrides (hybrid model)

ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS deadline_anchor timestamptz,
  ADD COLUMN IF NOT EXISTS deadline_gap_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS deadline_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
