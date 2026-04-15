-- Script para resetear la moral de todos los jugadores al 100%
UPDATE players 
SET morale = 100;

-- Opcional: Podrías querer resetear también el historial de moral si existe,
-- pero lo básico es la columna morale en la tabla players.
