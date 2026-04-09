-- =============================================
-- PIFA - Script 11: NormalizaciA3n de Relaciones de Mercado
-- Ejecutar este script para resolver errores de "Relationship not found"
-- =============================================

-- 1. Limpiar llaves forAaneas existentes en market_offers (nombres genAricos que podrAian variar)
DO $$ 
BEGIN 
    -- Intentar dropear llaves forAaneas si existen (nombres comunes generados por Supabase)
    ALTER TABLE IF EXISTS public.market_offers DROP CONSTRAINT IF EXISTS market_offers_buyer_club_id_fkey;
    ALTER TABLE IF EXISTS public.market_offers DROP CONSTRAINT IF EXISTS market_offers_seller_club_id_fkey;
    ALTER TABLE IF EXISTS public.market_offers DROP CONSTRAINT IF EXISTS public_market_offers_buyer_club_id_fkey;
    ALTER TABLE IF EXISTS public.market_offers DROP CONSTRAINT IF EXISTS public_market_offers_seller_club_id_fkey;
EXCEPTION WHEN OTHERS THEN 
    NULL; 
END $$;

-- 2. Crear llaves forAaneas con nombres EXPLAA CITOS y SIMPLES
ALTER TABLE public.market_offers 
    ADD CONSTRAINT buyer_club_fk FOREIGN KEY (buyer_club_id) REFERENCES public.clubs(id) ON DELETE CASCADE,
    ADD CONSTRAINT seller_club_fk FOREIGN KEY (seller_club_id) REFERENCES public.clubs(id) ON DELETE CASCADE;

-- 3. Limpiar llaves forAaneas en market_history
DO $$ 
BEGIN 
    ALTER TABLE IF EXISTS public.market_history DROP CONSTRAINT IF EXISTS market_history_from_club_id_fkey;
    ALTER TABLE IF EXISTS public.market_history DROP CONSTRAINT IF EXISTS market_history_to_club_id_fkey;
    ALTER TABLE IF EXISTS public.market_history DROP CONSTRAINT IF EXISTS public_market_history_from_club_id_fkey;
    ALTER TABLE IF EXISTS public.market_history DROP CONSTRAINT IF EXISTS public_market_history_to_club_id_fkey;
EXCEPTION WHEN OTHERS THEN 
    NULL; 
END $$;

-- 4. Crear llaves forAaneas de historia con nombres explAA citos
ALTER TABLE public.market_history 
    ADD CONSTRAINT from_club_fk FOREIGN KEY (from_club_id) REFERENCES public.clubs(id) ON DELETE SET NULL,
    ADD CONSTRAINT to_club_fk FOREIGN KEY (to_club_id) REFERENCES public.clubs(id) ON DELETE SET NULL;

-- 5. Asegurar que RLS estAA desactivado y permisos concedidos
ALTER TABLE public.market_offers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_history DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.market_offers TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.notifications TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.market_history TO anon, authenticated, service_role;

-- Mensaje de confirmaciA3n
SELECT 'Relaciones de mercado normalizadas exitosamente' as status;
