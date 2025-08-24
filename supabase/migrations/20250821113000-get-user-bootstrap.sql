-- Migration: get_user_bootstrap RPC
-- Generated: 2025-08-21
-- Purpose: Provide a single secure bootstrap payload for the signed-in user (profile + active subscription + credit balance)
-- Security: Uses public._assert_self to enforce caller ownership (or service_role bypass)

BEGIN;

-- Drop existing function (if any) to allow re-definition with updated signature/body
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_user_bootstrap'
      AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid'
  ) THEN
    EXECUTE 'DROP FUNCTION public.get_user_bootstrap(p_user_id uuid)';
  END IF;
END$$;

-- Create the RPC
CREATE OR REPLACE FUNCTION public.get_user_bootstrap(
  p_user_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, billing, auth
AS $$
DECLARE
  v_profile record;
  v_subscription record;
  v_credits integer;
BEGIN
  -- Ownership / auth enforcement (service_role bypass handled inside helper)
  PERFORM public._assert_self(p_user_id);

  -- Profile subset (exclude onboarding_survey_data / internal timestamps not needed client-side)
  SELECT id,
         username,
         avatar_url,
         banner_url,
         bio,
         onboarding_completed,
         created_at,
         timezone,
         default_persona_id
    INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  -- Active subscription (latest) with plan info
  SELECT s.id,
         s.plan_id,
         s.status,
         s.created_at,
         s.current_period_end,
         p.name AS plan_name,
         p.monthly_credits_allowance,
         p.model_tier
    INTO v_subscription
  FROM billing.subscriptions s
  JOIN billing.plans p ON p.id = s.plan_id
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- Credit balance (may be NULL if row not yet created)
  SELECT balance INTO v_credits
  FROM billing.credits
  WHERE user_id = p_user_id;

  RETURN json_build_object(
    'profile', CASE WHEN v_profile IS NOT NULL THEN to_jsonb(v_profile) ELSE NULL END,
    'subscription', CASE WHEN v_subscription IS NOT NULL THEN to_jsonb(v_subscription) ELSE NULL END,
    'credits', COALESCE(v_credits, 0)
  );
END;
$$;

-- Harden function privileges
REVOKE ALL ON FUNCTION public.get_user_bootstrap(p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_bootstrap(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_bootstrap(p_user_id uuid) TO service_role;

COMMIT;
