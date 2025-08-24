-- 20250821124500_get_user_billing_overview.sql
-- Consolidated user billing overview RPC.
-- Returns subscription (with plan), credit balance, recent credit pack purchases (with pack info),
-- active plans, active credit packs, and models with their minimum-priced active plan.
-- SECURITY: Enforces ownership via public._assert_self. Returns only non-sensitive columns.
-- This supersedes separate calls to: get_user_subscription_with_plan, get_user_credits,
-- get_user_credit_purchases, get_billing_catalog, and manual models/plans merging in the client.

-- Safety: Drop previous signature if it exists (idempotent for replays)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_user_billing_overview'
  ) THEN
    -- Assume previous signature (p_user_id uuid, p_purchases_limit integer)
    EXECUTE 'DROP FUNCTION public.get_user_billing_overview(p_user_id uuid, p_purchases_limit integer)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_user_billing_overview(
  p_user_id uuid,
  p_purchases_limit integer DEFAULT 25
) RETURNS json
LANGUAGE plpgsql
SET search_path TO public, billing, auth
AS $$
DECLARE
  v_subscription json;
  v_balance integer;
  v_purchases json;
  v_plans json;
  v_credit_packs json;
  v_models json;
BEGIN
  PERFORM public._assert_self(p_user_id);

  -- Latest active/non-cancelled subscription (if any)
  SELECT json_build_object(
           'id', s.id,
           'status', s.status,
           'current_period_end', s.current_period_end,
           'paypal_subscription_id', s.paypal_subscription_id,
           'plan', json_build_object(
             'id', p.id,
             'name', p.name,
             'monthly_credits_allowance', p.monthly_credits_allowance,
             'price_monthly', p.price_monthly,
             'price_yearly', p.price_yearly
           )
         )
    INTO v_subscription
  FROM billing.subscriptions s
  JOIN billing.plans p ON p.id = s.plan_id
  WHERE s.user_id = p_user_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- Credit balance
  SELECT balance INTO v_balance FROM billing.credits WHERE user_id = p_user_id;
  v_balance := COALESCE(v_balance, 0);

  -- Recent credit pack purchases (limit)
  SELECT json_agg(
           json_build_object(
             'id', cpp.id,
             'created_at', cpp.created_at,
             'status', cpp.status,
             'credits_granted', cpp.credits_granted,
             'amount_paid_cents', cpp.amount_paid_cents,
             'paypal_order_id', cpp.paypal_order_id,
             'credit_pack', json_build_object(
               'id', cp.id,
               'name', cp.name,
               'credits_granted', cp.credits_granted,
               'price_cents', cp.price_cents,
               'description', cp.description
             )
           ) ORDER BY cpp.created_at DESC
         )
    INTO v_purchases
  FROM (
    SELECT *
    FROM billing.credit_pack_purchases
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT GREATEST(p_purchases_limit,1)
  ) cpp
  JOIN billing.credit_packs cp ON cp.id = cpp.credit_pack_id;

  -- Active subscription plans
  SELECT json_agg(row_to_json(t) ORDER BY t.price_monthly NULLS FIRST)
    INTO v_plans
  FROM (
    SELECT p.id,
           p.name,
           p.price_monthly,
           p.price_yearly,
           p.monthly_credits_allowance,
           p.features,
           p.paypal_subscription_id
    FROM billing.plans p
    WHERE p.is_active
    ORDER BY p.price_monthly NULLS FIRST
  ) t;

  -- Active credit packs
  SELECT json_agg(row_to_json(t) ORDER BY t.price_cents)
    INTO v_credit_packs
  FROM (
    SELECT c.id,
           c.name,
           c.price_cents,
           c.credits_granted,
           c.description
    FROM billing.credit_packs c
    WHERE c.is_active
    ORDER BY c.price_cents
  ) t;

  -- Models with their minimum-priced active plan (if any)
  SELECT json_agg(
           json_build_object(
             'id', m.id,
             'name', m.name,
             'provider_model_id', m.provider_model_id,
             'min_plan', (
               SELECT row_to_json(p2) FROM (
                 SELECT p3.id,
                        p3.name,
                        p3.price_monthly,
                        p3.price_yearly,
                        p3.monthly_credits_allowance
                 FROM billing.plans p3
                 WHERE p3.model_id = m.id AND p3.is_active
                 ORDER BY p3.price_monthly ASC NULLS LAST
                 LIMIT 1
               ) p2
             )
           )
         )
    INTO v_models
  FROM billing.models m;

  RETURN json_build_object(
    'subscription', v_subscription,
    'credits', v_balance,
    'purchases', COALESCE(v_purchases, '[]'::json),
    'plans', COALESCE(v_plans, '[]'::json),
    'credit_packs', COALESCE(v_credit_packs, '[]'::json),
    'models', COALESCE(v_models, '[]'::json)
  );
END;$$;

COMMENT ON FUNCTION public.get_user_billing_overview(uuid, integer) IS 'Consolidated user billing overview (subscription, credits, purchases, active plans, credit packs, models w/ min plan). Enforces ownership via public._assert_self.';

-- Harden function privileges
REVOKE ALL ON FUNCTION public.get_user_billing_overview(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_billing_overview(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_billing_overview(uuid, integer) TO service_role;
