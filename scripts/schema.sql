-- ============================================================
-- schema.sql — Consolidated, idempotent schema for PIFA
-- ============================================================
-- Paste this file ONCE in the SQL editor of a fresh Supabase
-- project to recreate the public schema (tables, indexes, RLS off,
-- storage bucket, migration helpers). Data comes later via the
-- Import button in /admin-login.
--
-- Built by concatenating scripts/0?-*.sql .. scripts/2?-*.sql plus
-- migration-*.sql. Seed scripts (02 admin user, 05 init data) are
-- intentionally NOT included — data is restored from the JSON export.
-- ============================================================


-- ============================================================
-- >>> scripts/01-create-tables.sql
-- ============================================================
-- =============================================
-- PIFA - Script 1: Crear tablas base
-- Ejecutar este script primero en Supabase SQL Editor
-- =============================================

-- Tabla de clubes
CREATE TABLE IF NOT EXISTS clubs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  shield_url TEXT,
  budget DECIMAL(15, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de usuarios (DTs y Admins)
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de jugadores
CREATE TABLE IF NOT EXISTS players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  position VARCHAR(50) NOT NULL,
  number INTEGER,
  age INTEGER,
  nationality VARCHAR(100),
  photo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_club_id ON users(club_id);
CREATE INDEX IF NOT EXISTS idx_players_club_id ON players(club_id);

-- Mensaje de confirmación
SELECT 'Tablas creadas exitosamente' as status;

-- ============================================================
-- >>> scripts/03-disable-rls.sql
-- ============================================================
-- =============================================
-- PIFA - Script 3: Configurar RLS (Row Level Security)
-- Ejecutar este script DESPUÉS del script 02
-- =============================================

-- Opción 1: Desactivar RLS completamente (más simple para desarrollo)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE clubs DISABLE ROW LEVEL SECURITY;
ALTER TABLE players DISABLE ROW LEVEL SECURITY;

-- Verificar que el usuario admin existe
SELECT id, username, full_name, role FROM users WHERE username = 'admin';

-- Mensaje de confirmación
SELECT 'RLS desactivado exitosamente' as status;

-- ============================================================
-- >>> scripts/04-create-seasons-competitions.sql
-- ============================================================
-- =============================================
-- SISTEMA DE TEMPORADAS Y COMPETICIONES PIFA
-- Ejecutar después de las tablas base (clubs, users, players)
-- =============================================

-- 1. SEASONS - Temporadas
CREATE TABLE IF NOT EXISTS seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'finished')),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. COMPETITIONS - Competiciones dentro de temporadas
CREATE TABLE IF NOT EXISTS competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN ('league', 'cup', 'groups_knockout')),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'finished')),
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. COMPETITION_CLUBS - Clubes inscritos en cada competición
CREATE TABLE IF NOT EXISTS competition_clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  group_name VARCHAR(10),
  seed INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(competition_id, club_id)
);

-- 4. COMPETITION_STAGES - Fases de competición
CREATE TABLE IF NOT EXISTS competition_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('group', 'knockout', 'league')),
  stage_order INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'finished')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. MATCHES - Partidos
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES competition_stages(id) ON DELETE SET NULL,
  home_club_id UUID REFERENCES clubs(id), -- NULL para partidos "Por definir"
  away_club_id UUID REFERENCES clubs(id), -- NULL para partidos "Por definir"
  
  -- Ordenamiento y agrupación
  match_order INTEGER NOT NULL DEFAULT 0,
  matchday INTEGER,
  round_name VARCHAR(50),
  group_name VARCHAR(10),
  leg INTEGER DEFAULT 1,
  
  -- Programación
  scheduled_date TIMESTAMP WITH TIME ZONE,
  
  -- Estado y resultado
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'finished', 'postponed')),
  home_score INTEGER,
  away_score INTEGER,
  played_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadatos
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. STANDINGS - Tabla de posiciones
CREATE TABLE IF NOT EXISTS standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES competition_stages(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id),
  group_name VARCHAR(10),
  
  -- Estadísticas
  played INTEGER DEFAULT 0,
  won INTEGER DEFAULT 0,
  drawn INTEGER DEFAULT 0,
  lost INTEGER DEFAULT 0,
  goals_for INTEGER DEFAULT 0,
  goals_against INTEGER DEFAULT 0,
  goal_difference INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  
  -- Posición
  position INTEGER,
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(competition_id, stage_id, club_id, group_name)
);

-- 7. PLAYER_COMPETITION_STATS - Estadísticas de jugadores por competición
CREATE TABLE IF NOT EXISTS player_competition_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id),
  
  -- Estadísticas acumuladas
  matches_played INTEGER DEFAULT 0,
  goals INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  mvp_count INTEGER DEFAULT 0,
  yellow_cards INTEGER DEFAULT 0,
  red_cards INTEGER DEFAULT 0,
  minutes_played INTEGER DEFAULT 0,
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(competition_id, player_id)
);

-- =============================================
-- ÍNDICES PARA MEJOR RENDIMIENTO
-- =============================================

CREATE INDEX IF NOT EXISTS idx_competitions_season ON competitions(season_id);
CREATE INDEX IF NOT EXISTS idx_competition_clubs_competition ON competition_clubs(competition_id);
CREATE INDEX IF NOT EXISTS idx_competition_clubs_club ON competition_clubs(club_id);
CREATE INDEX IF NOT EXISTS idx_matches_competition ON matches(competition_id);
CREATE INDEX IF NOT EXISTS idx_matches_home_club ON matches(home_club_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_club ON matches(away_club_id);
CREATE INDEX IF NOT EXISTS idx_matches_order ON matches(match_order);
CREATE INDEX IF NOT EXISTS idx_standings_competition ON standings(competition_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_competition ON player_competition_stats(competition_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_player ON player_competition_stats(player_id);

-- =============================================
-- DESACTIVAR RLS PARA ESTAS TABLAS
-- =============================================

ALTER TABLE seasons DISABLE ROW LEVEL SECURITY;
ALTER TABLE competitions DISABLE ROW LEVEL SECURITY;
ALTER TABLE competition_clubs DISABLE ROW LEVEL SECURITY;
ALTER TABLE competition_stages DISABLE ROW LEVEL SECURITY;
ALTER TABLE matches DISABLE ROW LEVEL SECURITY;
ALTER TABLE standings DISABLE ROW LEVEL SECURITY;
ALTER TABLE player_competition_stats DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- >>> scripts/06-allow-null-clubs-in-matches.sql
-- ============================================================
-- =============================================
-- PERMITIR CLUBES NULL EN PARTIDOS
-- Necesario para partidos "Por definir" en copas y eliminatorias
-- Ejecutar después de 04-create-seasons-competitions.sql
-- =============================================

-- Modificar la restricción NOT NULL en home_club_id
ALTER TABLE matches ALTER COLUMN home_club_id DROP NOT NULL;

-- Modificar la restricción NOT NULL en away_club_id
ALTER TABLE matches ALTER COLUMN away_club_id DROP NOT NULL;

-- Verificar cambios
SELECT column_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'matches' 
AND column_name IN ('home_club_id', 'away_club_id');

-- ============================================================
-- >>> scripts/07-match-annotations.sql
-- ============================================================
-- =============================================
-- PIFA - Script 7: Sistema de Pre-anotaciones de Partidos
-- Ejecutar después de los scripts anteriores
-- =============================================

-- 1. Tabla de pre-anotaciones por club por partido
CREATE TABLE IF NOT EXISTS match_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id),
  
  -- Estadísticas anotadas por el DT
  -- goals: [{player_id: "uuid", count: 1}, ...]
  goals JSONB DEFAULT '[]',
  -- assists: [{player_id: "uuid", count: 1}, ...]
  assists JSONB DEFAULT '[]',
  -- MVP: puede ser de cualquier equipo, opcional
  mvp_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Máximo 1 anotación por club por partido
  UNIQUE(match_id, club_id)
);

-- 2. Agregar activated_at a seasons para controlar inicio de countdown
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP WITH TIME ZONE;

-- 3. Agregar deadline a matches para saber cuándo vence cada partido/jornada
ALTER TABLE matches ADD COLUMN IF NOT EXISTS deadline TIMESTAMP WITH TIME ZONE;

-- 4. Índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_match_annotations_match ON match_annotations(match_id);
CREATE INDEX IF NOT EXISTS idx_match_annotations_club ON match_annotations(club_id);
CREATE INDEX IF NOT EXISTS idx_matches_deadline ON matches(deadline);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);

-- 5. Desactivar RLS
ALTER TABLE match_annotations DISABLE ROW LEVEL SECURITY;

-- Mensaje de confirmación
SELECT 'Sistema de pre-anotaciones creado exitosamente' as status;

-- ============================================================
-- >>> scripts/08-lineups-and-subs.sql
-- ============================================================
-- Agregar "default_lineup" a la tabla clubs. Almacenará un JSON con la formación y las posiciones de los jugadores.
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS default_lineup JSONB;

-- Agregar arrays de UUIDs a match_annotations para saber qué jugadores jugaron realmente.
ALTER TABLE public.match_annotations ADD COLUMN IF NOT EXISTS starting_xi UUID[] DEFAULT '{}'::UUID[];
ALTER TABLE public.match_annotations ADD COLUMN IF NOT EXISTS substitutes_in UUID[] DEFAULT '{}'::UUID[];

-- Si ya existen anotaciones pasadas o quieres curarte en salud, puedes actualizar las columnas como nulas por defecto, 
-- pero un array vacío '{}' suele ser más fácil de iterar en código sin crashear.

-- ============================================================
-- >>> scripts/09-market-system.sql
-- ============================================================
-- Add market columns to players
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS is_on_sale BOOLEAN DEFAULT FALSE;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS sale_price NUMERIC DEFAULT NULL;

-- Create market_offers table
CREATE TABLE IF NOT EXISTS public.market_offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
    buyer_club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
    seller_club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, rejected, countered, cancelled
    previous_offer_id UUID REFERENCES public.market_offers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL, -- offer_received, offer_accepted, offer_rejected, offer_countered, offer_cancelled
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create market_history table
CREATE TABLE IF NOT EXISTS public.market_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
    from_club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL,
    to_club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL,
    type TEXT NOT NULL DEFAULT 'sale',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_market_offers_player ON public.market_offers(player_id);
CREATE INDEX IF NOT EXISTS idx_market_offers_buyer ON public.market_offers(buyer_club_id);
CREATE INDEX IF NOT EXISTS idx_market_offers_seller ON public.market_offers(seller_club_id);
CREATE INDEX IF NOT EXISTS idx_notifications_club ON public.notifications(club_id);
CREATE INDEX IF NOT EXISTS idx_market_history_player ON public.market_history(player_id);

-- Enable Realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_offers;

-- ============================================================
-- >>> scripts/10-market-rls-fix.sql
-- ============================================================
-- =============================================
-- PIFA - Script 10: Corregir Permisos de Mercado (RLS)
-- Ejecutar este script para permitir operaciones en las nuevas tablas de mercado
-- =============================================

-- Desactivar RLS para las tablas de mercado (Siguiendo el patroAAn del Script 03)
ALTER TABLE public.market_offers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_history DISABLE ROW LEVEL SECURITY;

-- Asegurar que el usuario anon pueda realizar operaciones (si RLS no se desactiva del todo en el dashboard de Supabase)
GRANT ALL ON TABLE public.market_offers TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.notifications TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.market_history TO anon, authenticated, service_role;

-- Mensaje de confirmaciA3n
SELECT 'Permisos de mercado actualizados exitosamente' as status;

-- ============================================================
-- >>> scripts/10-push-notifications.sql
-- ============================================================
-- Create the push tokens table
create table public.user_push_tokens (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  user_name text not null,
  expo_push_token text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Prevent duplicate tokens for the same user
  unique(user_id, expo_push_token)
);

-- Enable Row Level Security
alter table public.user_push_tokens enable row level security;

-- Create policies for management
create policy "Authenticated users can manage their own push tokens"
  on public.user_push_tokens
  for all
  using (true)
  with check (true);

-- Indices for performance
create index idx_push_tokens_user_id on public.user_push_tokens(user_id);
create index idx_push_tokens_token on public.user_push_tokens(expo_push_token);

-- ============================================================
-- >>> scripts/10-storage-setup.sql
-- ============================================================
-- 1. Crear el bucket 'pifa-assets' si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('pifa-assets', 'pifa-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Habilitar RLS (Row Level Security) en la tabla de objetos (si no está habilitado)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Política: Permitir lectura pública a todos
CREATE POLICY "Acceso Público de Lectura" ON storage.objects
FOR SELECT USING (bucket_id = 'pifa-assets');

-- 4. Política: Permitir inserción a cualquier usuario (dev setup)
-- NOTA: En producción, esto debería estar restringido a usuarios autenticados
CREATE POLICY "Permitir Subida Libre" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'pifa-assets');

-- 5. Política: Permitir actualización (dev setup)
CREATE POLICY "Permitir Actualización Libre" ON storage.objects
FOR UPDATE USING (bucket_id = 'pifa-assets');

-- 6. Política: Permitir borrado (dev setup)
CREATE POLICY "Permitir Borrado Libre" ON storage.objects
FOR DELETE USING (bucket_id = 'pifa-assets');

-- ============================================================
-- >>> scripts/11-diffusions-system.sql
-- ============================================================
-- Create diffusions table
CREATE TABLE IF NOT EXISTS diffusions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (Optional, normally disabled in this project as per 03-disable-rls.sql)
-- But we can add it for completeness or skip it if the project prefers no RLS.
-- Based on 03-disable-rls.sql, they are disabled on almost everything.

-- Add index for faster listing
CREATE INDEX IF NOT EXISTS idx_diffusions_created_at ON diffusions(created_at DESC);

-- ============================================================
-- >>> scripts/11-market-relationship-fix.sql
-- ============================================================
-- =============================================
-- PIFA - Script 11: NormalizaciA3n de Relaciones de Mercado
-- Ejecutar este script para resolver errores de "Relationship not found"
-- =============================================

-- 1. Limpiar llaves forAaneas existentes en market_offers (nombres genAricos que podrAian variar)
DO $$ 
BEGIN 
    -- Intentar dropear llaves forAaneas si existen (nombres comunes generados por Supabase)
    ALTER TABLE IF EXISTS public.market_offers DROP CONSTRAINT IF EXISTS market_offers_buyer_club_id_fkey;
    ALTER TABLE IF EXISTS public.market_offers DROP CONSTRAINT IF EXISTS market_offers_seller_club_id_fkey;
    ALTER TABLE IF EXISTS public.market_offers DROP CONSTRAINT IF EXISTS public_market_offers_buyer_club_id_fkey;
    ALTER TABLE IF EXISTS public.market_offers DROP CONSTRAINT IF EXISTS public_market_offers_seller_club_id_fkey;
EXCEPTION WHEN OTHERS THEN 
    NULL; 
END $$;

-- 2. Crear llaves forAaneas con nombres EXPLAA CITOS y SIMPLES
ALTER TABLE public.market_offers 
    ADD CONSTRAINT buyer_club_fk FOREIGN KEY (buyer_club_id) REFERENCES public.clubs(id) ON DELETE CASCADE,
    ADD CONSTRAINT seller_club_fk FOREIGN KEY (seller_club_id) REFERENCES public.clubs(id) ON DELETE CASCADE;

-- 3. Limpiar llaves forAaneas en market_history
DO $$ 
BEGIN 
    ALTER TABLE IF EXISTS public.market_history DROP CONSTRAINT IF EXISTS market_history_from_club_id_fkey;
    ALTER TABLE IF EXISTS public.market_history DROP CONSTRAINT IF EXISTS market_history_to_club_id_fkey;
    ALTER TABLE IF EXISTS public.market_history DROP CONSTRAINT IF EXISTS public_market_history_from_club_id_fkey;
    ALTER TABLE IF EXISTS public.market_history DROP CONSTRAINT IF EXISTS public_market_history_to_club_id_fkey;
EXCEPTION WHEN OTHERS THEN 
    NULL; 
END $$;

-- 4. Crear llaves forAaneas de historia con nombres explAA citos
ALTER TABLE public.market_history 
    ADD CONSTRAINT from_club_fk FOREIGN KEY (from_club_id) REFERENCES public.clubs(id) ON DELETE SET NULL,
    ADD CONSTRAINT to_club_fk FOREIGN KEY (to_club_id) REFERENCES public.clubs(id) ON DELETE SET NULL;

-- 5. Asegurar que RLS estAA desactivado y permisos concedidos
ALTER TABLE public.market_offers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_history DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.market_offers TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.notifications TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.market_history TO anon, authenticated, service_role;

-- Mensaje de confirmaciA3n
SELECT 'Relaciones de mercado normalizadas exitosamente' as status;

-- ============================================================
-- >>> scripts/12-palmares-system.sql
-- ============================================================
-- Create trophies table
CREATE TABLE IF NOT EXISTS trophies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create club_trophies table (many-to-many with quantity)
CREATE TABLE IF NOT EXISTS club_trophies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    trophy_id UUID NOT NULL REFERENCES trophies(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(club_id, trophy_id)
);

-- Index for faster lookup
CREATE INDEX IF NOT EXISTS idx_club_trophies_club_id ON club_trophies(club_id);
CREATE INDEX IF NOT EXISTS idx_club_trophies_trophy_id ON club_trophies(trophy_id);

-- ============================================================
-- >>> scripts/13-match-appeals.sql
-- ============================================================
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

-- ============================================================
-- >>> scripts/14-match-appeals-rls-fix.sql
-- ============================================================
-- =====================================================================
-- Hotfix: disable RLS on match_appeals so the client-side pending-appeal
-- check (used by MatchDetailsDrawer to hide the "Apelar Resultado" button)
-- can read the table. Run once.
-- =====================================================================

ALTER TABLE public.match_appeals DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- >>> scripts/15-performance-indexes.sql
-- ============================================================
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

-- News feed:
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

-- ============================================================
-- >>> scripts/16-season-archive.sql
-- ============================================================
-- Migración: añade soporte para archivado de temporadas finalizadas
-- Marca el momento exacto en que la temporada fue cerrada y archivada por el admin.

ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- Índice parcial: solo entradas archivadas (vista futura "Temporadas Pasadas").
CREATE INDEX IF NOT EXISTS idx_seasons_archived_at
  ON seasons(archived_at DESC)
  WHERE archived_at IS NOT NULL;

-- ============================================================
-- >>> scripts/17-season-awards.sql
-- ============================================================
-- Premios de temporada: ganadores elegidos + jerarquía de competiciones por temporada.

CREATE TABLE IF NOT EXISTS season_awards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  award_key TEXT NOT NULL,            -- ballon_dor | the_best | best_playmaker | golden_boot | oliver_kahn | club_year | dt_year
  winner_type TEXT NOT NULL,          -- player | club | user
  winner_id UUID,                     -- nullable hasta que el admin elige
  nominees JSONB NOT NULL DEFAULT '[]', -- lista curada ordenada [{type,id}]; vacío = usar cálculo
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(season_id, award_key)
);

CREATE TABLE IF NOT EXISTS season_award_weights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  weight NUMERIC NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(season_id, competition_id)
);

CREATE INDEX IF NOT EXISTS idx_season_awards_season ON season_awards(season_id);
CREATE INDEX IF NOT EXISTS idx_season_award_weights_season ON season_award_weights(season_id);

-- ============================================================
-- >>> scripts/18-award-voting.sql
-- ============================================================
-- Votación de premios de la gala por los DTs + papeleta publicada (congelada).

CREATE TABLE IF NOT EXISTS season_gala_publish (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL UNIQUE REFERENCES seasons(id) ON DELETE CASCADE,
  is_open BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL DEFAULT '{}',   -- { awards: {key: Nominee[]}, champions: [{competition, club, roster[]}] }
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS award_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  award_key TEXT NOT NULL,
  voter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  voter_name TEXT,
  first_id UUID,
  second_id UUID,
  third_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(season_id, award_key, voter_user_id)
);

CREATE INDEX IF NOT EXISTS idx_season_gala_publish_season ON season_gala_publish(season_id);
CREATE INDEX IF NOT EXISTS idx_award_votes_season ON award_votes(season_id);

-- ============================================================
-- >>> scripts/19-gala-results.sql
-- ============================================================
-- Permite al admin revelar a los DTs el podio oficial (top 5 + ganador) de cada premio.
-- Por defecto deshabilitado.

ALTER TABLE season_gala_publish
  ADD COLUMN IF NOT EXISTS results_visible BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- >>> scripts/20-moderator-role.sql
-- ============================================================
-- Nuevo rol "moderator": acceso restringido al panel admin.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin', 'moderator'));

-- ============================================================
-- >>> scripts/21-deadline-schedule.sql
-- ============================================================
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

-- ============================================================
-- >>> scripts/22-season-prizes.sql
-- ============================================================
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

-- ============================================================
-- >>> scripts/23-club-bonuses.sql
-- ============================================================
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

-- ============================================================
-- >>> scripts/24-player-creation-requests.sql
-- ============================================================
-- 24-player-creation-requests.sql
-- DT proposes creating a new player (e.g. signing a free agent that doesn't
-- exist in the app yet); admin approves (player is actually created and
-- assigned to the DT's club) or rejects. Cycle: pending -> approved/rejected.
-- See lib/player-request-engine.ts.

CREATE TABLE IF NOT EXISTS player_creation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Identity proposed by the DT
  name text NOT NULL,
  position text NOT NULL,
  number integer,
  age integer,
  nationality text,
  photo_url text,
  -- Approval cycle
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_notes text,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  player_id uuid REFERENCES players(id) ON DELETE SET NULL, -- created on approval
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pcr_status_created ON player_creation_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcr_club ON player_creation_requests(club_id, status);

ALTER TABLE player_creation_requests DISABLE ROW LEVEL SECURITY;

-- Safety: ensure player columns used at approval time exist (these were used in
-- code but not previously migrated; idempotent).
ALTER TABLE players ADD COLUMN IF NOT EXISTS release_clause integer DEFAULT 700000;
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_one_club_man boolean DEFAULT false;

-- ============================================================
-- >>> scripts/25-db-migration.sql
-- ============================================================
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

-- ============================================================
-- >>> scripts/migration-contracts.sql
-- ============================================================
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

-- ============================================================
-- >>> scripts/migration_injuries_stamina.sql
-- ============================================================
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
