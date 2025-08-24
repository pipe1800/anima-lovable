-- Migration: get_user_profile_overview RPC (unified profile + counts + subscription/credits for self)
-- Created at: 2025-08-21
-- Security & Privacy Principles:
--  - Public viewers get ONLY public profile subset (public_profiles view equivalent) + public-safe counts (chats, characters, favorites)
--  - Private (self) viewers (target == viewer) additionally receive: full private profile subset needed by client, personas count (optional flag), subscription, credits
--  - Uses SECURITY DEFINER and explicit ownership checks for private fields via public._assert_self
--  - Does NOT leak emails, internal metadata, or onboarding_survey_data
--  - Favorites count for public viewers is included (adjust if product requires hiding)
--  - Personas count is always 0 unless self AND p_include_personas = true
--  - All numeric counts bounded to >= 0

DO $$ BEGIN
  -- Idempotent drop (if signature changed) 
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_user_profile_overview'
      AND pg_get_function_identity_arguments(p.oid) = 'p_target_user_id uuid, p_viewer_user_id uuid, p_include_personas boolean'
  ) THEN
    EXECUTE 'DROP FUNCTION public.get_user_profile_overview(p_target_user_id uuid, p_viewer_user_id uuid, p_include_personas boolean)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_user_profile_overview(
  p_target_user_id uuid,
  p_viewer_user_id uuid,
  p_include_personas boolean DEFAULT false
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, billing, auth
AS $$
DECLARE
  v_is_self boolean := (p_target_user_id = p_viewer_user_id);
  v_profile jsonb;
  v_subscription jsonb;
  v_credits integer := 0;
  v_counts jsonb;
BEGIN
  -- When accessing private view ensure ownership; public view is allowed without it.
  IF v_is_self THEN
    PERFORM public._assert_self(p_target_user_id);
  END IF;

  -- Profile selection (subset). For public, mimic public_profiles view.
  IF v_is_self THEN
    SELECT to_jsonb(sub) INTO v_profile FROM (
      SELECT id,
             username,
             avatar_url,
             banner_url,
             bio,
             onboarding_completed,
             created_at,
             timezone,
             default_persona_id
        FROM profiles
       WHERE id = p_target_user_id
    ) sub;
  ELSE
    SELECT to_jsonb(sub) INTO v_profile FROM (
      SELECT id,
             username,
             avatar_url,
             bio,
             created_at
        FROM public_profiles
       WHERE id = p_target_user_id
    ) sub;
  END IF;

  -- Counts (always public-safe). Personas gated.
  SELECT jsonb_build_object(
           'chats',       COALESCE((SELECT count(*) FROM chats WHERE user_id = p_target_user_id),0),
           'characters',  COALESCE((SELECT count(*) FROM characters WHERE creator_id = p_target_user_id),0),
           'favorites',   COALESCE((SELECT count(*) FROM character_favorites WHERE user_id = p_target_user_id),0),
           'personas',    CASE WHEN v_is_self AND p_include_personas THEN COALESCE((SELECT count(*) FROM personas WHERE user_id = p_target_user_id),0) ELSE 0 END
         ) INTO v_counts;

  IF v_is_self THEN
    -- Subscription (latest active) + credits
    SELECT to_jsonb(sub) INTO v_subscription FROM (
      SELECT s.id,
             s.plan_id,
             s.status,
             s.created_at,
             s.current_period_end,
             p.name AS plan_name,
             p.monthly_credits_allowance,
             p.model_tier
        FROM billing.subscriptions s
        JOIN billing.plans p ON p.id = s.plan_id
       WHERE s.user_id = p_target_user_id
         AND s.status = 'active'
       ORDER BY s.created_at DESC
       LIMIT 1
    ) sub;

    SELECT balance INTO v_credits
      FROM billing.credits
     WHERE user_id = p_target_user_id;
  END IF;

  RETURN json_build_object(
    'profile',      v_profile,
    'counts',       v_counts,
    'subscription', CASE WHEN v_is_self THEN v_subscription ELSE NULL END,
    'credits',      CASE WHEN v_is_self THEN COALESCE(v_credits,0) ELSE NULL END
  );
END;
$$;

COMMENT ON FUNCTION public.get_user_profile_overview(uuid, uuid, boolean) IS 'Unified profile fetch: public or private (if self) plus counts (chats, characters, favorites, optional personas) and self subscription/credits.';

REVOKE ALL ON FUNCTION public.get_user_profile_overview(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_profile_overview(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_profile_overview(uuid, uuid, boolean) TO service_role;
