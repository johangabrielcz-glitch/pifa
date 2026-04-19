-- OPTIMIZACIÓN DE RENDIMIENTO PARA CHAT GLOBAL
-- Estos índices resuelven los errores de "statement timeout" acelerando las uniones y ordenamiento.

-- 1. Índice para ordenamiento por fecha (Carga inicial y scroll)
CREATE INDEX IF NOT EXISTS idx_global_chat_messages_created_at 
ON global_chat_messages (created_at DESC);

-- 2. Índices para llaves foráneas (Acelera los Joins con users, clubs y replies)
CREATE INDEX IF NOT EXISTS idx_global_chat_messages_user_id 
ON global_chat_messages (user_id);

CREATE INDEX IF NOT EXISTS idx_global_chat_messages_club_id 
ON global_chat_messages (club_id);

CREATE INDEX IF NOT EXISTS idx_global_chat_messages_reply_to_id 
ON global_chat_messages (reply_to_id);

-- 3. Índice para el estado de lectura (Acelera la carga de notificaciones de chat)
CREATE INDEX IF NOT EXISTS idx_global_chat_read_status_user_club 
ON global_chat_read_status (user_id, club_id);
