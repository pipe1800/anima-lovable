-- Update The Whale plan to include "Unlock all Character Add-ons" feature like True Fan
UPDATE plans 
SET features = '{
  "features": [
    "Up to 32,000 credits/month", 
    "Access to Genius models", 
    "Unlock all Character Add-ons",
    "NSFW model access", 
    "Priority queue", 
    "Early access to new features"
  ]
}'::jsonb
WHERE name = 'The Whale';