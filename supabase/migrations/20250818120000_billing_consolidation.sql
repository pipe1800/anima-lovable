-- Billing Consolidation Migration (Long-Term Canonical Billing Schema)
-- Date: 2025-08-18
-- Goal: Migrate legacy public billing tables (plans, subscriptions, credits) to billing.* schema
--       Add PayPal compatibility columns, backfill data, create updatable views to
--       preserve existing application code, and enhance credit consumption with ledger.
--       This migration is idempotent (safe to re-run) where possible.

-- 1. Ensure additional columns exist on canonical billing tables
DO $$
BEGIN
  -- Add paypal_subscription_id to billing.plans if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='billing' AND table_name='plans' AND column_name='paypal_subscription_id'
  ) THEN
    ALTER TABLE billing.plans ADD COLUMN paypal_subscription_id text;
  END IF;

  -- Add paypal_subscription_id to billing.subscriptions if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='billing' AND table_name='subscriptions' AND column_name='paypal_subscription_id'
  ) THEN
    ALTER TABLE billing.subscriptions ADD COLUMN paypal_subscription_id text UNIQUE;
  END IF;
END $$;

-- 2. Backfill billing.plans from public.plans (legacy) by name (non-destructive)
INSERT INTO billing.plans (name, price_monthly, monthly_credits_allowance, features, is_active, paypal_subscription_id)
SELECT p.name,
       p.price_monthly,
       p.monthly_credits_allowance,
       COALESCE(p.features, '{}'::jsonb),
       COALESCE(p.is_active, true),
       p.paypal_subscription_id
FROM public.plans p
LEFT JOIN billing.plans bp ON bp.name = p.name
WHERE bp.id IS NULL;

-- 3. Update existing billing.plans paypal_subscription_id where null
UPDATE billing.plans bp
SET paypal_subscription_id = p.paypal_subscription_id
FROM public.plans p
WHERE p.name = bp.name
  AND bp.paypal_subscription_id IS DISTINCT FROM p.paypal_subscription_id;

-- 4. Backfill billing.credits
INSERT INTO billing.credits (user_id, balance)
SELECT c.user_id, c.balance
FROM public.credits c
LEFT JOIN billing.credits bc ON bc.user_id = c.user_id
WHERE bc.user_id IS NULL;

-- 5. Backfill billing.subscriptions (one active per user enforced by unique constraint)
-- Strategy: Insert at most one row per user (prioritize active > trialing > past_due > canceled) and ignore if already exists.
WITH legacy_subs AS (
  SELECT DISTINCT ON (s.user_id)
         s.user_id,
         s.plan_id,
         LOWER(s.status) AS status,
         s.current_period_end,
         s.paypal_subscription_id,
         CASE LOWER(s.status)
           WHEN 'active' THEN 1
           WHEN 'trialing' THEN 2
           WHEN 'past_due' THEN 3
           ELSE 4
         END AS status_rank
  FROM public.subscriptions s
  ORDER BY s.user_id, status_rank, s.current_period_end DESC NULLS LAST, s.created_at DESC
)
INSERT INTO billing.subscriptions (user_id, plan_id, status, current_period_end, paypal_subscription_id)
SELECT ls.user_id,
       bp.id AS plan_id,
       (CASE ls.status
          WHEN 'active' THEN 'active'
          WHEN 'trialing' THEN 'trialing'
          WHEN 'past_due' THEN 'past_due'
          ELSE 'canceled'
        END)::billing.subscription_status,
       ls.current_period_end,
       ls.paypal_subscription_id
FROM legacy_subs ls
JOIN public.plans p ON p.id = ls.plan_id
JOIN billing.plans bp ON bp.name = p.name
ON CONFLICT (user_id) DO NOTHING;

-- 6. Rename legacy public tables (if not yet renamed) and create updatable compatibility views.
DO $$
BEGIN
  -- plans
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='plans' AND c.relkind='r') THEN
    ALTER TABLE public.plans RENAME TO plans_legacy;
  END IF;
  -- subscriptions
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='subscriptions' AND c.relkind='r') THEN
    ALTER TABLE public.subscriptions RENAME TO subscriptions_legacy;
  END IF;
  -- credits
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='credits' AND c.relkind='r') THEN
    ALTER TABLE public.credits RENAME TO credits_legacy;
  END IF;
END $$;

-- 7. Create or replace views (simple, updatable) mapping to billing tables
CREATE OR REPLACE VIEW public.plans AS
SELECT id, name, price_monthly, price_yearly, monthly_credits_allowance, features,
       stripe_price_id_monthly, stripe_price_id_yearly, is_active, paypal_subscription_id
FROM billing.plans;

CREATE OR REPLACE VIEW public.subscriptions AS
SELECT id, user_id, plan_id, status::text AS status, current_period_end,
       stripe_subscription_id, created_at, paypal_subscription_id
FROM billing.subscriptions;

CREATE OR REPLACE VIEW public.credits AS
SELECT user_id, balance
FROM billing.credits;

-- 8. RLS already defined on billing.* tables; ensure views are selectable.
-- (No extra action needed: access controlled by underlying tables.)

-- 9. Replace public.consume_credits function to operate on billing tables + ledger.
DROP FUNCTION IF EXISTS public.consume_credits(uuid, integer);
CREATE OR REPLACE FUNCTION public.consume_credits(user_id_param uuid, credits_to_consume integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, billing
AS $$
DECLARE
  current_balance integer;
  new_balance integer;
BEGIN
  SELECT balance INTO current_balance FROM billing.credits WHERE user_id = user_id_param FOR UPDATE;
  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'Credits record not found for user %', user_id_param;
  END IF;
  IF credits_to_consume < 0 THEN
    RAISE EXCEPTION 'credits_to_consume must be positive';
  END IF;
  IF current_balance < credits_to_consume THEN
    RETURN jsonb_build_object('success', false, 'balance', current_balance);
  END IF;
  new_balance := current_balance - credits_to_consume;
  UPDATE billing.credits SET balance = new_balance WHERE user_id = user_id_param;
  -- Insert ledger row
  INSERT INTO billing.credit_ledger (user_id, change_amount, transaction_type, description)
  VALUES (user_id_param, -credits_to_consume, 'message_cost', 'Message token consumption');
  RETURN jsonb_build_object('success', true, 'balance', new_balance);
END;
$$;

COMMENT ON FUNCTION public.consume_credits(uuid, integer) IS 'Consumes credits atomically using canonical billing schema returning {success, balance}.';
GRANT EXECUTE ON FUNCTION public.consume_credits(uuid, integer) TO authenticated;

-- 10. (Optional) helper view for single active subscription enforcement diagnostics
CREATE OR REPLACE VIEW billing.active_subscription_diagnostics AS
SELECT user_id,
       COUNT(*) FILTER (WHERE status='active') AS active_count,
       MAX(current_period_end) FILTER (WHERE status='active') AS active_max_period_end
FROM billing.subscriptions
GROUP BY user_id;

-- 11. (Optional) index improvements (only if not existing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='billing' AND indexname='idx_billing_subscriptions_user_active') THEN
    CREATE INDEX idx_billing_subscriptions_user_active ON billing.subscriptions (user_id) WHERE status='active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='billing' AND indexname='idx_billing_credits_balance') THEN
    CREATE INDEX idx_billing_credits_balance ON billing.credits (balance);
  END IF;
END $$;

-- 12. Refresh search path sensitive privileges (ensure auth role can still select views)
GRANT SELECT ON public.plans TO authenticated;
GRANT SELECT, UPDATE ON public.subscriptions TO authenticated;
GRANT SELECT, UPDATE ON public.credits TO authenticated;

-- End migration
