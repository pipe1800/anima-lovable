-- Migration: Consolidate billing-related data into billing schema (canonical)
-- Date: 2025-08-20
-- Goal: Hydrate billing.* tables from existing public.* duplicates (plans, subscriptions, credits)
-- This migration DOES NOT drop public tables. A follow-up migration will:
--   1) Update application code to reference billing.* directly
--   2) Replace public tables with updatable views or drop them after a stability window
-- Safe to re-run (idempotent inserts / column additions guarded by IF NOT EXISTS / ON CONFLICT)

BEGIN;

--------------------------------------------------------------------------------
-- 1. Add missing columns to billing tables to cover all data in public tables
--------------------------------------------------------------------------------
-- public.plans has paypal_subscription_id (plan-level PayPal plan id)
ALTER TABLE billing.plans
  ADD COLUMN IF NOT EXISTS paypal_subscription_id text;

-- public.subscriptions has paypal_subscription_id (user-specific subscription id)
ALTER TABLE billing.subscriptions
  ADD COLUMN IF NOT EXISTS paypal_subscription_id text;

-- Ensure price_monthly column type can accept numeric from public (public uses numeric)
-- (If billing.price_monthly already integer this cast during upsert is fine.)
-- Optional: widen to numeric if you need cents precision later.

--------------------------------------------------------------------------------
-- 2. Upsert plans from public.plans into billing.plans
--------------------------------------------------------------------------------
-- Assumptions:
--  - billing.plans already contains Stripe-related columns (stripe_price_id_monthly/yearly)
--  - public.plans may not have yearly price or stripe columns -> we leave existing billing values intact
--  - We coerce numeric price_monthly to integer (truncate) for now.
INSERT INTO billing.plans (
  id, name, price_monthly, price_yearly, monthly_credits_allowance, features,
  stripe_price_id_monthly, stripe_price_id_yearly, is_active, paypal_subscription_id
)
SELECT 
  p.id,
  p.name,
  COALESCE(p.price_monthly::int, 0) AS price_monthly,
  bp.price_yearly, -- preserve existing if row already exists (will be ignored on conflict update below unless null there)
  p.monthly_credits_allowance,
  p.features,
  bp.stripe_price_id_monthly,
  bp.stripe_price_id_yearly,
  p.is_active,
  p.paypal_subscription_id
FROM public.plans p
LEFT JOIN billing.plans bp ON bp.id = p.id
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_monthly = EXCLUDED.price_monthly,
  monthly_credits_allowance = EXCLUDED.monthly_credits_allowance,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active,
  paypal_subscription_id = EXCLUDED.paypal_subscription_id
-- Do NOT overwrite existing yearly / stripe price ids if already populated
WHERE (
  billing.plans.name IS DISTINCT FROM EXCLUDED.name OR
  billing.plans.price_monthly IS DISTINCT FROM EXCLUDED.price_monthly OR
  billing.plans.monthly_credits_allowance IS DISTINCT FROM EXCLUDED.monthly_credits_allowance OR
  billing.plans.features IS DISTINCT FROM EXCLUDED.features OR
  billing.plans.is_active IS DISTINCT FROM EXCLUDED.is_active OR
  billing.plans.paypal_subscription_id IS DISTINCT FROM EXCLUDED.paypal_subscription_id
);

--------------------------------------------------------------------------------
-- 3. Upsert subscriptions from public.subscriptions into billing.subscriptions
--------------------------------------------------------------------------------
-- Original approach conflicted on (id) but billing.subscriptions enforces a UNIQUE(user_id)
-- which can cause duplicate key violation if multiple historical public subscriptions exist
-- for the same user. We now:
--  * rank public subscriptions per user (latest current_period_end / created_at)
--  * keep only the newest per user
--  * upsert on user_id (authoritative single active subscription per user)
--  * preserve existing billing.stripe_subscription_id if present
WITH ranked AS (
  SELECT s.*, row_number() OVER (
    PARTITION BY s.user_id
    ORDER BY s.current_period_end DESC NULLS LAST, s.created_at DESC NULLS LAST, s.id DESC
  ) AS rn
  FROM public.subscriptions s
), filtered AS (
  SELECT * FROM ranked WHERE rn = 1
), mapped AS (
  SELECT 
    f.id, -- may be ignored if conflict on user_id
    f.user_id,
    f.plan_id,
    CASE f.status
      WHEN 'active' THEN 'active'
      WHEN 'past_due' THEN 'past_due'
      WHEN 'canceled' THEN 'canceled'
      WHEN 'trialing' THEN 'trialing'
      ELSE 'active'
    END::billing.subscription_status AS status,
    f.current_period_end,
    f.paypal_subscription_id,
    f.created_at
  FROM filtered f
)
INSERT INTO billing.subscriptions (
  id, user_id, plan_id, status, current_period_end,
  stripe_subscription_id, paypal_subscription_id, created_at
)
SELECT 
  m.id,
  m.user_id,
  m.plan_id,
  m.status,
  m.current_period_end,
  bs.stripe_subscription_id, -- retain existing stripe id if row already exists
  m.paypal_subscription_id,
  m.created_at
FROM mapped m
LEFT JOIN billing.subscriptions bs ON bs.user_id = m.user_id
ON CONFLICT (user_id) DO UPDATE SET
  plan_id = EXCLUDED.plan_id,
  status = EXCLUDED.status,
  current_period_end = EXCLUDED.current_period_end,
  paypal_subscription_id = EXCLUDED.paypal_subscription_id
WHERE (
  billing.subscriptions.plan_id IS DISTINCT FROM EXCLUDED.plan_id OR
  billing.subscriptions.status IS DISTINCT FROM EXCLUDED.status OR
  billing.subscriptions.current_period_end IS DISTINCT FROM EXCLUDED.current_period_end OR
  billing.subscriptions.paypal_subscription_id IS DISTINCT FROM EXCLUDED.paypal_subscription_id
);

--------------------------------------------------------------------------------
-- 4. Upsert credits from public.credits into billing.credits
--------------------------------------------------------------------------------
-- Choose the greater balance as authoritative to avoid accidental downgrades.
INSERT INTO billing.credits (user_id, balance)
SELECT c.user_id, c.balance
FROM public.credits c
ON CONFLICT (user_id) DO UPDATE SET
  balance = GREATEST(billing.credits.balance, EXCLUDED.balance)
WHERE billing.credits.balance IS DISTINCT FROM EXCLUDED.balance;

--------------------------------------------------------------------------------
-- 5. (Optional) Consistency checks (no changes). You can run these manually after migration.
-- SELECT 'plan_count_public', count(*) FROM public.plans;
-- SELECT 'plan_count_billing', count(*) FROM billing.plans;
-- SELECT 'subscription_count_public', count(*) FROM public.subscriptions;
-- SELECT 'subscription_count_billing', count(*) FROM billing.subscriptions;
-- SELECT 'credits_user_mismatch', count(*) FROM (
--   SELECT p.user_id FROM public.credits p
--   EXCEPT
--   SELECT b.user_id FROM billing.credits b
-- ) q;

COMMIT;

-- Next steps (not performed here):
--  1. Update application code to reference billing.plans / billing.subscriptions / billing.credits explicitly.
--  2. Create views in public schema pointing to billing tables OR drop public duplicates after code deploy.
--  3. Backfill any Stripe IDs into billing.plans if still only stored elsewhere.
--  4. Consider triggers or scheduled job if a long interim period expected.
