-- =============================================
-- PIFA - Script 10: Corregir Permisos de Mercado (RLS)
-- Ejecutar este script para permitir operaciones en las nuevas tablas de mercado
-- =============================================

-- Desactivar RLS para las tablas de mercado (Siguiendo el patroAAn del Script 03)
ALTER TABLE public.market_offers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_history DISABLE ROW LEVEL SECURITY;

-- Asegurar que el usuario anon pueda realizar operaciones (si RLS no se desactiva del todo en el dashboard de Supabase)
GRANT ALL ON TABLE public.market_offers TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.notifications TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.market_history TO anon, authenticated, service_role;

-- Mensaje de confirmaciA3n
SELECT 'Permisos de mercado actualizados exitosamente' as status;
