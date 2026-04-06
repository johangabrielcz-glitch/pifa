-- Script para inicializar datos faltantes en competiciones existentes
-- Ejecutar después de 04-create-seasons-competitions.sql

-- 1. Primero, agregar restricciones únicas más simples para standings y player_competition_stats
-- (si las tablas ya existen, esto creará las restricciones necesarias)

-- Crear índice único para standings si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'standings_competition_club_unique'
  ) THEN
    -- Eliminar duplicados primero si existen
    DELETE FROM standings a USING standings b
    WHERE a.id > b.id 
    AND a.competition_id = b.competition_id 
    AND a.club_id = b.club_id;
    
    -- Crear la restricción
    ALTER TABLE standings ADD CONSTRAINT standings_competition_club_unique UNIQUE (competition_id, club_id);
  END IF;
EXCEPTION WHEN others THEN
  -- Si falla, ignorar (puede que ya exista o haya conflictos)
  NULL;
END $$;

-- Crear índice único para player_competition_stats si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'player_stats_competition_player_unique'
  ) THEN
    -- Eliminar duplicados primero si existen
    DELETE FROM player_competition_stats a USING player_competition_stats b
    WHERE a.id > b.id 
    AND a.competition_id = b.competition_id 
    AND a.player_id = b.player_id;
    
    -- Crear la restricción
    ALTER TABLE player_competition_stats ADD CONSTRAINT player_stats_competition_player_unique UNIQUE (competition_id, player_id);
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- 2. Inicializar standings para clubes inscritos que no tienen standings
INSERT INTO standings (competition_id, club_id, group_name, played, won, drawn, lost, goals_for, goals_against, goal_difference, points)
SELECT 
  cc.competition_id,
  cc.club_id,
  cc.group_name,
  0, 0, 0, 0, 0, 0, 0, 0
FROM competition_clubs cc
WHERE NOT EXISTS (
  SELECT 1 FROM standings s 
  WHERE s.competition_id = cc.competition_id AND s.club_id = cc.club_id
);

-- 3. Inicializar player_competition_stats para jugadores de clubes inscritos
INSERT INTO player_competition_stats (competition_id, player_id, club_id, matches_played, goals, assists, mvp_count, yellow_cards, red_cards, minutes_played)
SELECT 
  cc.competition_id,
  p.id,
  p.club_id,
  0, 0, 0, 0, 0, 0, 0
FROM competition_clubs cc
JOIN players p ON p.club_id = cc.club_id
WHERE NOT EXISTS (
  SELECT 1 FROM player_competition_stats pcs 
  WHERE pcs.competition_id = cc.competition_id AND pcs.player_id = p.id
);

-- 4. Asegurar que RLS esté desactivado
ALTER TABLE standings DISABLE ROW LEVEL SECURITY;
ALTER TABLE player_competition_stats DISABLE ROW LEVEL SECURITY;

-- 5. Verificar datos creados
SELECT 'Standings creados:' as info, COUNT(*) as total FROM standings;
SELECT 'Player stats creados:' as info, COUNT(*) as total FROM player_competition_stats;
