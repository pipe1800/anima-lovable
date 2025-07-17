-- =============================================
-- MONETIZATION SYSTEM MIGRATION
-- =============================================

-- Create plans table for subscription tiers
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  price_monthly NUMERIC NOT NULL,
  credits_granted INTEGER NOT NULL DEFAULT 0,
  features JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create subscriptions table to track user subscriptions
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, plan_id)
);

-- Create models table for AI model tiers
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

-- Create credit_packs table for one-time purchases
CREATE TABLE public.credit_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  price NUMERIC NOT NULL,
  credits_granted INTEGER NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create credit_pack_purchases table to track one-time purchases
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

-- Enable Row Level Security on all tables
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_pack_purchases ENABLE ROW LEVEL SECURITY;

-- RLS Policies for plans table (publicly readable)
CREATE POLICY "Plans are publicly viewable" ON public.plans
  FOR SELECT USING (is_active = true);

-- RLS Policies for subscriptions table (users can only see their own)
CREATE POLICY "Users can view their own subscriptions" ON public.subscriptions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update their own subscriptions" ON public.subscriptions
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Service can manage all subscriptions" ON public.subscriptions
  FOR ALL USING (true);

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

-- Create triggers for updated_at columns
CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================
-- SEED DATA
-- =============================================

-- Insert subscription plans
INSERT INTO public.plans (name, price_monthly, credits_granted, features) VALUES
('Premium', 9.99, 15000, '{"features": ["Basic AI models", "Standard generation speed", "Community support", "Up to 15,000 credits/month"]}'),
('Pro', 24.99, 40000, '{"features": ["All AI models", "Priority generation", "Advanced features", "Premium support", "Up to 40,000 credits/month", "NSFW content"]}');

-- Get plan IDs for model references
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
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_credit_pack_purchases_user_id ON public.credit_pack_purchases(user_id);
CREATE INDEX idx_models_min_plan_id ON public.models(min_plan_id);

-- Add comments for documentation
COMMENT ON TABLE public.plans IS 'Subscription plans with pricing and credit allowances';
COMMENT ON TABLE public.subscriptions IS 'User subscription tracking with Stripe integration';
COMMENT ON TABLE public.models IS 'AI model tiers with credit multipliers and access requirements';
COMMENT ON TABLE public.credit_packs IS 'One-time purchase options for additional credits';
COMMENT ON TABLE public.credit_pack_purchases IS 'Tracking of one-time credit pack purchases';