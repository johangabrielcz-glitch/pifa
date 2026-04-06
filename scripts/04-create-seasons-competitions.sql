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
