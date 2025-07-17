-- Migration to switch from Stripe to PayPal identifiers
-- Update subscriptions table to use PayPal column names
ALTER TABLE subscriptions 
RENAME COLUMN stripe_subscription_id TO paypal_subscription_id;

-- Update credit_pack_purchases table to use PayPal column names
ALTER TABLE credit_pack_purchases 
RENAME COLUMN stripe_payment_intent_id TO paypal_order_id;