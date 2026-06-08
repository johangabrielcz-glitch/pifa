-- 26-missing-tables.sql
-- Tables that are actively used by the app (lib/*-engine.ts, components/pifa/*)
-- but were never created by any numbered script — they exist in the live
-- project only because they were created by hand from the Supabase
-- Dashboard (Table editor) at some point. Without this file, a fresh
-- project built from scripts/01..25 ends up missing chat, stickers, the
-- player-AI-chat history and clause-negotiation features even though
-- everything else works. Schemas below are reverse-engineered from the
-- exact columns each call site selects/inserts/upserts.

-- Clause-negotiation chat with the AI (lib/market-engine.ts, app/api/market/clause-chat)
-- Shape matches lib/types.ts ClauseNegotiation.
CREATE TABLE IF NOT EXISTS public.clause_negotiations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid REFERENCES public.players(id) ON DELETE CASCADE,
  buyer_club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  season_id uuid REFERENCES public.seasons(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active', -- active | blocked | accepted
  patience integer NOT NULL DEFAULT 100,
  deal_terms jsonb, -- { salary, squad_role, seasons } once accepted
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clause_negotiations_player_id ON public.clause_negotiations(player_id);
CREATE INDEX IF NOT EXISTS idx_clause_negotiations_buyer_club_id ON public.clause_negotiations(buyer_club_id);

-- Global chat (components/pifa/global-chat.tsx, lib/use-unread-chat.ts)
CREATE TABLE IF NOT EXISTS public.global_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL,
  content text NOT NULL,
  media_url text,
  media_type text, -- image | video | sticker
  reply_to_id uuid REFERENCES public.global_chat_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_global_chat_messages_created_at ON public.global_chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_global_chat_messages_reply_to_id ON public.global_chat_messages(reply_to_id);

-- Per-user/per-club "last read" marker — upserted with onConflict: 'user_id,club_id'
CREATE TABLE IF NOT EXISTS public.global_chat_read_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  last_read_message_id uuid REFERENCES public.global_chat_messages(id) ON DELETE SET NULL,
  last_read_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, club_id)
);

-- Stickers a user has saved to their picker in the global chat
CREATE TABLE IF NOT EXISTS public.user_stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_stickers_user_id ON public.user_stickers(user_id);

-- DT <-> player AI chat history — one row per (player, club), upserted with
-- onConflict: 'player_id,club_id' (app/api/player/chat/route.ts)
CREATE TABLE IF NOT EXISTS public.player_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  messages jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, club_id)
);
