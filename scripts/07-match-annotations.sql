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
