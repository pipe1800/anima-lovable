-- =============================================
-- MONETIZATION SYSTEM MIGRATION (Updated)
-- =============================================

-- Create models table for AI model tiers (NEW)
CREATE TABLE public.models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name TEXT NOT NULL UNIQUE,
  credit_multiplier NUMERIC NOT NULL DEFAULT 1,
  is_nsfw_compatible BOOLEAN NOT NULL DEFAULT false,
  min_plan_id UUID REFERENCES public.plans(id),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create credit_packs table for one-time purchases (NEW)
CREATE TABLE public.credit_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  price NUMERIC NOT NULL,
  credits_granted INTEGER NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create credit_pack_purchases table to track one-time purchases (NEW)
CREATE TABLE public.credit_pack_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credit_pack_id UUID NOT NULL REFERENCES public.credit_packs(id),
  stripe_payment_intent_id TEXT UNIQUE,
  amount_paid NUMERIC NOT NULL,
  credits_granted INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security on new tables
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_pack_purchases ENABLE ROW LEVEL SECURITY;

-- RLS Policies for models table (publicly readable)
CREATE POLICY "Models are publicly viewable" ON public.models
  FOR SELECT USING (is_active = true);

-- RLS Policies for credit_packs table (publicly readable)
CREATE POLICY "Credit packs are publicly viewable" ON public.credit_packs
  FOR SELECT USING (is_active = true);

-- RLS Policies for credit_pack_purchases table (users can only see their own)
CREATE POLICY "Users can view their own credit pack purchases" ON public.credit_pack_purchases
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service can manage all credit pack purchases" ON public.credit_pack_purchases
  FOR ALL USING (true);

-- =============================================
-- SEED DATA
-- =============================================

-- Clear existing plans and insert new ones with proper structure
DELETE FROM public.plans WHERE name IN ('Premium', 'Pro');

-- Insert subscription plans (using existing table structure)
INSERT INTO public.plans (name, price_monthly, monthly_credits_allowance, features, is_active) VALUES
('Premium', 9.99, 15000, '{"features": ["Basic AI models", "Standard generation speed", "Community support", "Up to 15,000 credits/month"]}', true),
('Pro', 24.99, 40000, '{"features": ["All AI models", "Priority generation", "Advanced features", "Premium support", "Up to 40,000 credits/month", "NSFW content"]}', true);

-- Get plan IDs for model references and insert AI model tiers
DO $$
DECLARE
    premium_plan_id UUID;
    pro_plan_id UUID;
BEGIN
    SELECT id INTO premium_plan_id FROM public.plans WHERE name = 'Premium';
    SELECT id INTO pro_plan_id FROM public.plans WHERE name = 'Pro';
    
    -- Insert AI model tiers
    INSERT INTO public.models (tier_name, credit_multiplier, is_nsfw_compatible, min_plan_id, description) VALUES
    ('Fast & Fun', 1, false, premium_plan_id, 'Quick and efficient AI model perfect for everyday conversations and basic creative tasks'),
    ('Smart & Creative', 2, false, premium_plan_id, 'Advanced AI model with enhanced creativity and reasoning capabilities'),
    ('Genius', 5, true, pro_plan_id, 'Our most powerful AI model with exceptional intelligence and NSFW compatibility');
END $$;

-- Insert credit packs for one-time purchases
INSERT INTO public.credit_packs (name, price, credits_granted, description) VALUES
('Booster Pack', 4.99, 5000, 'Perfect for occasional users who need extra credits'),
('Power Pack', 12.99, 15000, 'Great value pack for heavy users who want to stock up on credits');

-- Create indexes for better performance
CREATE INDEX idx_credit_pack_purchases_user_id ON public.credit_pack_purchases(user_id);
CREATE INDEX idx_models_min_plan_id ON public.models(min_plan_id);
CREATE INDEX idx_models_tier_name ON public.models(tier_name);
CREATE INDEX idx_credit_packs_active ON public.credit_packs(is_active);

-- Add comments for documentation
COMMENT ON TABLE public.models IS 'AI model tiers with credit multipliers and access requirements';
COMMENT ON TABLE public.credit_packs IS 'One-time purchase options for additional credits';
COMMENT ON TABLE public.credit_pack_purchases IS 'Tracking of one-time credit pack purchases';