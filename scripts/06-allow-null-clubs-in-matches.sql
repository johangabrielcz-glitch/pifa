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
