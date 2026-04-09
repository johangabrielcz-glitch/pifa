-- 1. Crear el bucket 'pifa-assets' si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('pifa-assets', 'pifa-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Habilitar RLS (Row Level Security) en la tabla de objetos (si no está habilitado)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Política: Permitir lectura pública a todos
CREATE POLICY "Acceso Público de Lectura" ON storage.objects
FOR SELECT USING (bucket_id = 'pifa-assets');

-- 4. Política: Permitir inserción a cualquier usuario (dev setup)
-- NOTA: En producción, esto debería estar restringido a usuarios autenticados
CREATE POLICY "Permitir Subida Libre" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'pifa-assets');

-- 5. Política: Permitir actualización (dev setup)
CREATE POLICY "Permitir Actualización Libre" ON storage.objects
FOR UPDATE USING (bucket_id = 'pifa-assets');

-- 6. Política: Permitir borrado (dev setup)
CREATE POLICY "Permitir Borrado Libre" ON storage.objects
FOR DELETE USING (bucket_id = 'pifa-assets');
