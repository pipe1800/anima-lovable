
-- Add PayPal subscription ID to plans table
ALTER TABLE public.plans ADD COLUMN paypal_subscription_id TEXT;

-- Update existing plans with PayPal subscription IDs
UPDATE public.plans 
SET paypal_subscription_id = 'P-70K46447GU478721BNBXH5PA'
WHERE name = 'The Whale';

UPDATE public.plans 
SET paypal_subscription_id = 'P-6FV20741XD451732ENBXH6WY'
WHERE name = 'True Fan';
