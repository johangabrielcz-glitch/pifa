-- Votación de premios de la gala por los DTs + papeleta publicada (congelada).

CREATE TABLE IF NOT EXISTS season_gala_publish (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL UNIQUE REFERENCES seasons(id) ON DELETE CASCADE,
  is_open BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL DEFAULT '{}',   -- { awards: {key: Nominee[]}, champions: [{competition, club, roster[]}] }
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS award_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  award_key TEXT NOT NULL,
  voter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  voter_name TEXT,
  first_id UUID,
  second_id UUID,
  third_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(season_id, award_key, voter_user_id)
);

CREATE INDEX IF NOT EXISTS idx_season_gala_publish_season ON season_gala_publish(season_id);
CREATE INDEX IF NOT EXISTS idx_award_votes_season ON award_votes(season_id);
