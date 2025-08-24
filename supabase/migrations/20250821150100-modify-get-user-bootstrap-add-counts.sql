-- Migration: Modify get_user_bootstrap to include counts (chats, characters, favorites, personas)
-- Created: 2025-08-21
-- Notes: Personas count only meaningful privately; still safe here since function asserts self. Public overview handled separately.

BEGIN;

-- Drop existing function to replace (signature unchanged)
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
  v_credits integer := 0;
  v_counts jsonb;
BEGIN
  PERFORM public._assert_self(p_user_id);

  SELECT id, username, avatar_url, banner_url, bio, onboarding_completed, created_at, timezone, default_persona_id
    INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  SELECT s.id, s.plan_id, s.status, s.created_at, s.current_period_end,
         p.name AS plan_name, p.monthly_credits_allowance, p.model_tier
    INTO v_subscription
  FROM billing.subscriptions s
  JOIN billing.plans p ON p.id = s.plan_id
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;

  SELECT balance INTO v_credits FROM billing.credits WHERE user_id = p_user_id;

  SELECT jsonb_build_object(
           'chats',      COALESCE((SELECT count(*) FROM chats WHERE user_id = p_user_id),0),
           'characters', COALESCE((SELECT count(*) FROM characters WHERE creator_id = p_user_id),0),
           'favorites',  COALESCE((SELECT count(*) FROM character_favorites WHERE user_id = p_user_id),0),
           'personas',   COALESCE((SELECT count(*) FROM personas WHERE user_id = p_user_id),0)
         )
    INTO v_counts;

  RETURN json_build_object(
    'profile',      CASE WHEN v_profile IS NOT NULL THEN to_jsonb(v_profile) ELSE NULL END,
    'subscription', CASE WHEN v_subscription IS NOT NULL THEN to_jsonb(v_subscription) ELSE NULL END,
    'credits',      COALESCE(v_credits,0),
    'counts',       v_counts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_bootstrap(p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_bootstrap(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_bootstrap(p_user_id uuid) TO service_role;

COMMIT;
