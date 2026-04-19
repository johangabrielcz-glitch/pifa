-- PERMITIR JUGADORES SIN CLUB (AGENTES LIBRES)
-- Este script elimina la restricción que obliga a todo jugador a tener un club_id.
-- Es indispensable para que el sistema de Agentes Libres y Despidos funcione.

ALTER TABLE players ALTER COLUMN club_id DROP NOT NULL;

-- NOTA: Una vez ejecutado este cambio, la columna club_id aceptará valores nulos.
-- El sistema lo usará para identificar a los jugadores que están en el mercado libre.
