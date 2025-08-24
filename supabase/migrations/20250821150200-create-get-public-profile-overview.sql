-- Migration: Create get_public_profile_overview (public-safe profile + counts)
-- Created: 2025-08-21
-- Security: No private fields; no need for ownership assertion. Returns personas count = 0 always (could be extended via product rules).

BEGIN;

-- Drop existing function if exists (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_public_profile_overview'
      AND pg_get_function_identity_arguments(p.oid) = 'p_target_user_id uuid'
  ) THEN
    EXECUTE 'DROP FUNCTION public.get_public_profile_overview(p_target_user_id uuid)';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.get_public_profile_overview(
  p_target_user_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, billing, auth
AS $$
DECLARE
  v_profile jsonb;
  v_counts jsonb;
BEGIN
  SELECT to_jsonb(sub) INTO v_profile FROM (
    SELECT id, username, avatar_url, bio, created_at
      FROM public_profiles
     WHERE id = p_target_user_id
  ) sub;

  SELECT jsonb_build_object(
           'chats',      COALESCE((SELECT count(*) FROM chats WHERE user_id = p_target_user_id),0),
           'characters', COALESCE((SELECT count(*) FROM characters WHERE creator_id = p_target_user_id),0),
           'favorites',  COALESCE((SELECT count(*) FROM character_favorites WHERE user_id = p_target_user_id),0),
           'personas',   0
         )
    INTO v_counts;

  RETURN json_build_object(
    'profile', v_profile,
    'counts',  v_counts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile_overview(p_target_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile_overview(p_target_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profile_overview(p_target_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_profile_overview(p_target_user_id uuid) TO service_role;

COMMIT;
