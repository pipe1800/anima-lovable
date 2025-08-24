-- Migration: Fix get_user_dashboard_overview CTE misuse (single SELECT aggregation)
-- Created: 2025-08-21
-- Reason: Original function used a WITH clause followed by multiple SELECT statements.
--         CTEs only apply to the first statement, causing 42P01 for fav_chars / liked on subsequent SELECTs.
-- Approach: Aggregate all needed JSON arrays in one SELECT while CTEs are in scope.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_user_dashboard_overview'
      AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_chars_limit integer, p_favs_limit integer'
  ) THEN
    EXECUTE 'DROP FUNCTION public.get_user_dashboard_overview(p_user_id uuid, p_chars_limit integer, p_favs_limit integer)';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.get_user_dashboard_overview(
  p_user_id uuid,
  p_chars_limit int DEFAULT 30,
  p_favs_limit int DEFAULT 30
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, billing, auth
AS $$
DECLARE
  v_chars jsonb := '[]'::jsonb;
  v_favs jsonb := '[]'::jsonb;
  v_liked_ids jsonb := '[]'::jsonb;
  v_counts jsonb;
BEGIN
  PERFORM public._assert_self(p_user_id);

  WITH user_chars AS (
    SELECT c.id, c.name, c.avatar_url, c.visibility, c.likes_count, c.chats_count, c.tagline, c.updated_at
    FROM characters c
    WHERE c.creator_id = p_user_id
    ORDER BY c.updated_at DESC NULLS LAST
    LIMIT GREATEST(p_chars_limit, 0)
  ), fav_ids AS (
    SELECT cf.character_id, cf.created_at
    FROM character_favorites cf
    WHERE cf.user_id = p_user_id
    ORDER BY cf.created_at DESC
    LIMIT GREATEST(p_favs_limit, 0)
  ), fav_chars AS (
    SELECT c.id, c.name, c.avatar_url, c.visibility, c.likes_count, c.chats_count, c.tagline, f.created_at AS favorited_at
    FROM characters c
    JOIN fav_ids f ON f.character_id = c.id
    WHERE c.visibility = 'public'
  ), liked AS (
    SELECT cl.character_id
    FROM character_likes cl
    WHERE cl.user_id = p_user_id
      AND cl.character_id IN (
        SELECT id FROM user_chars
        UNION
        SELECT id FROM fav_chars
      )
  )
  SELECT
    COALESCE((SELECT jsonb_agg(to_jsonb(u.*)) FROM user_chars u), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(to_jsonb(f.*)) FROM fav_chars f), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(to_jsonb(l.character_id)) FROM liked l), '[]'::jsonb)
  INTO v_chars, v_favs, v_liked_ids;

  SELECT jsonb_build_object(
           'characters', (SELECT count(*) FROM characters WHERE creator_id = p_user_id),
           'favorites',  (SELECT count(*) FROM character_favorites WHERE user_id = p_user_id),
           'chats',      (SELECT count(*) FROM chats WHERE user_id = p_user_id)
         ) INTO v_counts;

  RETURN json_build_object(
    'characters', v_chars,
    'favorites', v_favs,
    'liked_ids', v_liked_ids,
    'counts', v_counts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_dashboard_overview(p_user_id uuid, p_chars_limit int, p_favs_limit int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_dashboard_overview(p_user_id uuid, p_chars_limit int, p_favs_limit int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_dashboard_overview(p_user_id uuid, p_chars_limit int, p_favs_limit int) TO service_role;

COMMIT;
