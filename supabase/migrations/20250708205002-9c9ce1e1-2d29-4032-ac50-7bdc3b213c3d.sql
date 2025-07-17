-- First, update any models that reference the plans we're about to delete
UPDATE models 
SET min_plan_id = NULL 
WHERE min_plan_id IN (
  SELECT id FROM plans WHERE name IN ('Premium', 'Pro')
);

-- Delete legacy plans
DELETE FROM plans WHERE name IN ('Premium', 'Pro');

-- Configure Guest Pass
UPDATE plans 
SET 
  price_monthly = 0.00,
  monthly_credits_allowance = 1000,
  features = '{"features": ["Access to Fast & Fun models"]}'::jsonb
WHERE name = 'Guest Pass';

-- Configure True Fan
UPDATE plans 
SET 
  price_monthly = 14.95,
  monthly_credits_allowance = 15000,
  features = '{"features": ["15,000 Credits/month", "Access to Smart & Creative models", "Unlock all Character Add-ons", "Standard support"]}'::jsonb
WHERE name = 'True Fan';

-- Configure The Whale
UPDATE plans 
SET 
  price_monthly = 24.95,
  monthly_credits_allowance = 40000,
  features = '{"features": ["40,000 Credits/month", "Access to Genius models", "NSFW model access", "Priority queue", "Early access to new features"]}'::jsonb
WHERE name = 'The Whale';