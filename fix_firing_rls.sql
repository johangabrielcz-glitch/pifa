-- REPARACIÓN DE POLÍTICAS RLS PARA DESPIDOS (RESCISIÓN)
-- Este script permite que los clubes liberen a sus jugadores (club_id = NULL) sin que la base de datos bloquee el cambio.

-- 1. Eliminar política antigua si es demasiado restrictiva (opcional, ajusta el nombre si es diferente)
-- DROP POLICY IF EXISTS "Clubs can update their own players" ON players;

-- 2. Crear o actualizar política para permitir despidos
-- Esta política permite UPDATE si el usuario era el dueño actual del jugador.
-- Importante: El WITH CHECK (true) permite que el nuevo estado sea NULL.

CREATE POLICY "Allow clubs to fire players" ON players
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  club_id = (SELECT club_id FROM users WHERE id = auth.uid())
)
WITH CHECK (
  -- Permite que el nuevo club_id sea NULL (despido) 
  -- o que siga siendo el club del usuario (edición normal)
  club_id IS NULL OR club_id = (SELECT club_id FROM users WHERE id = auth.uid())
);

-- NOTA: Si ya tenías una política llamada "Clubs can update their own players", 
-- asegúrate de que su cláusula WITH CHECK incluya "OR club_id IS NULL".
