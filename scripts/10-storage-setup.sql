-- 1. Crear el bucket 'pifa-assets' si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('pifa-assets', 'pifa-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2-6. RLS y políticas de storage.objects.
-- En proyectos Supabase NUEVOS, el rol del SQL editor ("postgres") ya no es
-- owner de storage.objects (pertenece a supabase_storage_admin), así que
-- ALTER TABLE / CREATE POLICY sobre esa tabla exigen ownership y fallan con
-- 42501 "must be owner of table objects". En proyectos antiguos sí funcionan
-- (de ahí que este bloque lo siga intentando, de forma idempotente con
-- DROP POLICY IF EXISTS). Si falla por privilegios, no frena el script: solo
-- avisa, porque RLS en storage.objects ya viene activado por defecto en
-- proyectos nuevos y las políticas se pueden crear a mano desde
-- Dashboard → Storage → bucket "pifa-assets" → Policies → New policy
-- (una por SELECT/INSERT/UPDATE/DELETE, condición bucket_id = 'pifa-assets').
DO $$
BEGIN
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Acceso Público de Lectura" ON storage.objects;
  CREATE POLICY "Acceso Público de Lectura" ON storage.objects
    FOR SELECT USING (bucket_id = 'pifa-assets');

  DROP POLICY IF EXISTS "Permitir Subida Libre" ON storage.objects;
  CREATE POLICY "Permitir Subida Libre" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'pifa-assets');

  DROP POLICY IF EXISTS "Permitir Actualización Libre" ON storage.objects;
  CREATE POLICY "Permitir Actualización Libre" ON storage.objects
    FOR UPDATE USING (bucket_id = 'pifa-assets');

  DROP POLICY IF EXISTS "Permitir Borrado Libre" ON storage.objects;
  CREATE POLICY "Permitir Borrado Libre" ON storage.objects
    FOR DELETE USING (bucket_id = 'pifa-assets');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Sin permiso para crear políticas en storage.objects (normal en proyectos Supabase nuevos: la tabla pertenece a supabase_storage_admin, no a postgres). Bucket "pifa-assets" creado igual y RLS ya viene activo por defecto — solo crea las 4 políticas a mano: Dashboard → Storage → pifa-assets → Policies → New policy, una por SELECT/INSERT/UPDATE/DELETE con la condición bucket_id = ''pifa-assets''. Sin ellas, las subidas desde el navegador (escudos, fotos, chat) fallarán; el panel admin vía service role no se ve afectado.';
END $$;
