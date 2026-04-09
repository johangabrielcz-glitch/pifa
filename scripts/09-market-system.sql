-- Add market columns to players
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS is_on_sale BOOLEAN DEFAULT FALSE;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS sale_price NUMERIC DEFAULT NULL;

-- Create market_offers table
CREATE TABLE IF NOT EXISTS public.market_offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
    buyer_club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
    seller_club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, rejected, countered, cancelled
    previous_offer_id UUID REFERENCES public.market_offers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL, -- offer_received, offer_accepted, offer_rejected, offer_countered, offer_cancelled
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create market_history table
CREATE TABLE IF NOT EXISTS public.market_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
    from_club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL,
    to_club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL,
    type TEXT NOT NULL DEFAULT 'sale',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_market_offers_player ON public.market_offers(player_id);
CREATE INDEX IF NOT EXISTS idx_market_offers_buyer ON public.market_offers(buyer_club_id);
CREATE INDEX IF NOT EXISTS idx_market_offers_seller ON public.market_offers(seller_club_id);
CREATE INDEX IF NOT EXISTS idx_notifications_club ON public.notifications(club_id);
CREATE INDEX IF NOT EXISTS idx_market_history_player ON public.market_history(player_id);

-- Enable Realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_offers;
