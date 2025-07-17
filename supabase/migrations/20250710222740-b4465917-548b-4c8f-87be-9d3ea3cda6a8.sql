-- Remove unused Stripe integration columns from plans table
ALTER TABLE public.plans 
DROP COLUMN IF EXISTS price_yearly,
DROP COLUMN IF EXISTS stripe_price_id_monthly,
DROP COLUMN IF EXISTS stripe_price_id_yearly;