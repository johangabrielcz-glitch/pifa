-- =============================================
-- PIFA - Script 2: Crear primer usuario ADMIN
-- Ejecutar este script DESPUÉS del script 01
-- =============================================

-- Crear primer usuario administrador
-- Usuario: admin
-- Contraseña: admin123 (CAMBIAR EN PRODUCCIÓN)
INSERT INTO users (username, password, full_name, role)
VALUES ('admin', 'admin123', 'Administrador PIFA', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Mensaje de confirmación
SELECT 'Usuario admin creado exitosamente' as status;
