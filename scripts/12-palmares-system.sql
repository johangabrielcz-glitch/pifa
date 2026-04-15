-- Create trophies table
CREATE TABLE IF NOT EXISTS trophies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create club_trophies table (many-to-many with quantity)
CREATE TABLE IF NOT EXISTS club_trophies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    trophy_id UUID NOT NULL REFERENCES trophies(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(club_id, trophy_id)
);

-- Index for faster lookup
CREATE INDEX IF NOT EXISTS idx_club_trophies_club_id ON club_trophies(club_id);
CREATE INDEX IF NOT EXISTS idx_club_trophies_trophy_id ON club_trophies(trophy_id);
