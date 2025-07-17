
-- Reset user 1a9d4667-1054-492c-b856-929d510c8556 to brand new user state
-- Remove all active subscriptions
DELETE FROM public.subscriptions 
WHERE user_id = '1a9d4667-1054-492c-b856-929d510c8556';

-- Reset credits to default new user amount (50 credits)
UPDATE public.credits 
SET balance = 50 
WHERE user_id = '1a9d4667-1054-492c-b856-929d510c8556';
