-- 20250821123000_add_billing_catalog_rpc.sql
-- Adds consolidated billing catalog RPC (plans, credit packs, credit balance) without exposing billing schema.
-- SECURITY: Uses ownership enforcement via public._assert_self and limits exposed columns.

CREATE OR REPLACE FUNCTION public.get_billing_catalog(
  p_user_id uuid
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO public, billing, auth
AS $$
DECLARE
  v_plans json;
  v_packs json;
  v_balance integer;
BEGIN
  PERFORM public._assert_self(p_user_id);

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

  SELECT json_agg(row_to_json(t) ORDER BY t.price_cents)
    INTO v_packs
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

  SELECT balance INTO v_balance FROM billing.credits WHERE user_id = p_user_id;

  RETURN json_build_object(
    'plans', coalesce(v_plans, '[]'::json),
    'credit_packs', coalesce(v_packs, '[]'::json),
    'credits_balance', coalesce(v_balance, 0)
  );
END;$$;
COMMENT ON FUNCTION public.get_billing_catalog(uuid) IS 'Consolidated billing catalog (active plans, credit packs, and current credit balance) without exposing billing schema.';
