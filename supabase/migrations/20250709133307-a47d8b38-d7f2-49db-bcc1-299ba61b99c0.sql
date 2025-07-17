-- Create a test subscription for admin@animachat.app user for "True Fan" plan
INSERT INTO public.subscriptions (
    user_id,
    plan_id,
    status,
    current_period_end,
    paypal_subscription_id,
    created_at
) VALUES (
    '61dd99c7-818d-49fe-8441-60eaae40f92d', -- admin@animachat.app user ID
    'a97be912-a48f-463a-9107-f2a7035440a4', -- True Fan plan ID
    'active',
    NOW() + INTERVAL '1 month', -- Set expiry to 1 month from now
    'I-TEST123PAYPALSUBID456', -- Fake PayPal subscription ID for testing
    NOW()
)
ON CONFLICT DO NOTHING; -- Prevent duplicate if subscription already exists