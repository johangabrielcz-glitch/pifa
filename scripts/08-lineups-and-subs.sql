-- Agregar "default_lineup" a la tabla clubs. Almacenará un JSON con la formación y las posiciones de los jugadores.
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS default_lineup JSONB;

-- Agregar arrays de UUIDs a match_annotations para saber qué jugadores jugaron realmente.
ALTER TABLE public.match_annotations ADD COLUMN IF NOT EXISTS starting_xi UUID[] DEFAULT '{}'::UUID[];
ALTER TABLE public.match_annotations ADD COLUMN IF NOT EXISTS substitutes_in UUID[] DEFAULT '{}'::UUID[];

-- Si ya existen anotaciones pasadas o quieres curarte en salud, puedes actualizar las columnas como nulas por defecto, 
-- pero un array vacío '{}' suele ser más fácil de iterar en código sin crashear.
