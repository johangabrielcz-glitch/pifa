-- Permite al admin revelar a los DTs el podio oficial (top 5 + ganador) de cada premio.
-- Por defecto deshabilitado.

ALTER TABLE season_gala_publish
  ADD COLUMN IF NOT EXISTS results_visible BOOLEAN NOT NULL DEFAULT false;
