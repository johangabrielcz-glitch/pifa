-- Migración: añade soporte para archivado de temporadas finalizadas
-- Marca el momento exacto en que la temporada fue cerrada y archivada por el admin.

ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- Índice parcial: solo entradas archivadas (vista futura "Temporadas Pasadas").
CREATE INDEX IF NOT EXISTS idx_seasons_archived_at
  ON seasons(archived_at DESC)
  WHERE archived_at IS NOT NULL;
