-- Premios de temporada: ganadores elegidos + jerarquía de competiciones por temporada.

CREATE TABLE IF NOT EXISTS season_awards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  award_key TEXT NOT NULL,            -- ballon_dor | the_best | best_playmaker | golden_boot | oliver_kahn | club_year | dt_year
  winner_type TEXT NOT NULL,          -- player | club | user
  winner_id UUID,                     -- nullable hasta que el admin elige
  nominees JSONB NOT NULL DEFAULT '[]', -- lista curada ordenada [{type,id}]; vacío = usar cálculo
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(season_id, award_key)
);

CREATE TABLE IF NOT EXISTS season_award_weights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  weight NUMERIC NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(season_id, competition_id)
);

CREATE INDEX IF NOT EXISTS idx_season_awards_season ON season_awards(season_id);
CREATE INDEX IF NOT EXISTS idx_season_award_weights_season ON season_award_weights(season_id);
