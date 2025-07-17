-- Update True Fan plan configuration
UPDATE plans 
SET 
  price_monthly = 14.95,
  monthly_credits_allowance = 15000,
  features = '{"features": ["15,000 Credits/month", "Access to Smart & Creative models", "Unlock all Character Add-ons", "NSFW model access", "Standard support"]}'::jsonb
WHERE name = 'True Fan';