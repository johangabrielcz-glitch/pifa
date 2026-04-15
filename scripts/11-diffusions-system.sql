-- Create diffusions table
CREATE TABLE IF NOT EXISTS diffusions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (Optional, normally disabled in this project as per 03-disable-rls.sql)
-- But we can add it for completeness or skip it if the project prefers no RLS.
-- Based on 03-disable-rls.sql, they are disabled on almost everything.

-- Add index for faster listing
CREATE INDEX IF NOT EXISTS idx_diffusions_created_at ON diffusions(created_at DESC);
