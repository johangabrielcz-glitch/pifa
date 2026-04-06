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
