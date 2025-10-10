-- Migration: remove legacy bootstrap RPCs and refresh related overview helpers
-- Purpose: drop aggregated bootstrap endpoints and rely on discrete queries; also update overview RPCs with persona counts.

set check_function_bodies = off;

drop function if exists public.get_chat_bootstrap_snapshot(uuid, uuid, uuid, boolean, integer);
drop function if exists public.get_user_bootstrap(uuid);

create or replace function public.get_public_profile_overview(p_target_user_id uuid)
returns json
language plpgsql
security definer
set search_path = 'public', 'billing', 'auth'
as $$
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
           'personas',   COALESCE((SELECT count(*) FROM personas WHERE user_id = p_target_user_id),0)
         )
    INTO v_counts;

  RETURN json_build_object(
    'profile', v_profile,
    'counts',  v_counts
  );
END;
$$;

create or replace function public.get_user_dashboard_overview(
  p_user_id uuid,
  p_chars_limit integer default 30,
  p_favs_limit integer default 30
) returns json
language plpgsql
security definer
set search_path = 'public', 'billing', 'auth'
as $$
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
           'chats',      (SELECT count(*) FROM chats WHERE user_id = p_user_id),
           'personas',   (SELECT count(*) FROM personas WHERE user_id = p_user_id)
         ) INTO v_counts;

  RETURN json_build_object(
    'characters', v_chars,
    'favorites', v_favs,
    'liked_ids', v_liked_ids,
    'counts', v_counts
  );
END;
$$;

set check_function_bodies = on;

