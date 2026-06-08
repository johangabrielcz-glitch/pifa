-- =============================================
-- PIFA - Script 1: Crear tablas base
-- Ejecutar este script primero en Supabase SQL Editor
-- =============================================

-- Tabla de clubes
CREATE TABLE IF NOT EXISTS clubs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  shield_url TEXT,
  budget DECIMAL(15, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de usuarios (DTs y Admins)
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de jugadores
CREATE TABLE IF NOT EXISTS players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  position VARCHAR(50) NOT NULL,
  number INTEGER,
  age INTEGER,
  nationality VARCHAR(100),
  photo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_club_id ON users(club_id);
CREATE INDEX IF NOT EXISTS idx_players_club_id ON players(club_id);

-- The CREATE TABLE above declares club_id NOT NULL, but the live schema has
-- long since had that constraint dropped by hand — free agents (released via
-- dismissPlayer in contract-engine.ts / market-engine.ts, or created without
-- a club in admin/players) are stored with club_id = NULL. Without this, a
-- fresh project rejects every free-agent row on import with "null value in
-- column club_id violates not-null constraint". DROP NOT NULL is a no-op if
-- the column is already nullable, so this stays idempotent either way.
ALTER TABLE players ALTER COLUMN club_id DROP NOT NULL;

-- Mensaje de confirmación
SELECT 'Tablas creadas exitosamente' as status;
