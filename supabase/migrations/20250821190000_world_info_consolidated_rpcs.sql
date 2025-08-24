-- Consolidated World Info RPCs
-- Security & Privacy Focus: all functions are SECURITY DEFINER and enforce row-level access logic internally.
-- NOTE (UPDATED 2025-08-21): Removed dependency on non-existent table world_info_users.
-- Existing tables used now: world_infos, world_info_entries, world_info_tags, tags, world_info_user_likes, profiles.
-- If a future explicit "collection" table is added, adapt list_user_world_infos collected CTE accordingly.

-- Helper: ensure pg_trgm extension available (safe if already exists)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

--------------------------------------------------------------------------------
-- 1. fetch_world_info_full(p_world_info_id uuid)
--    Returns a single world info with entries, tags, creator profile, and
--    interaction flags (is_liked, is_used) respecting visibility & access.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fetch_world_info_full(p_world_info_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', wi.id,
    'name', wi.name,
    'short_description', wi.short_description,
    'visibility', wi.visibility,
    'creator_id', wi.creator_id,
    'likes_count', wi.likes_count,
    'interaction_count', wi.interaction_count,
    'created_at', wi.created_at,
    'updated_at', wi.updated_at,
    'creator', to_jsonb(pr) - 'id',
    'entries', COALESCE(e.entries, '[]'::jsonb),
    'tags', COALESCE(t.tags, '[]'::jsonb),
    'is_liked', CASE WHEN v_user_id IS NOT NULL AND EXISTS(
        SELECT 1 FROM world_info_user_likes l 
        WHERE l.world_info_id = wi.id AND l.user_id = v_user_id
      ) THEN true ELSE false END,
    -- is_used deprecated (table world_info_users absent); returning false placeholder
    'is_used', false
  ) INTO v_result
  FROM world_infos wi
  LEFT JOIN profiles pr ON pr.id = wi.creator_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id', we.id,
      'keywords', we.keywords,
      'entry_text', we.entry_text,
      'created_at', we.created_at
    ) ORDER BY we.created_at DESC) AS entries
    FROM world_info_entries we
    WHERE we.world_info_id = wi.id
  ) e ON TRUE
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('id', tg.id, 'name', tg.name) ORDER BY tg.name) AS tags
    FROM world_info_tags wit
    JOIN tags tg ON tg.id = wit.tag_id
    WHERE wit.world_info_id = wi.id
  ) t ON TRUE
  WHERE wi.id = p_world_info_id
    AND (
      wi.visibility = 'public'
      OR (v_user_id IS NOT NULL AND wi.creator_id = v_user_id)
      OR (v_user_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM world_info_user_likes l 
          WHERE l.world_info_id = wi.id AND l.user_id = v_user_id
        ))
    );

  IF v_result IS NULL THEN
    RETURN NULL; -- Access denied or not found
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fetch_world_info_full(uuid) IS 'Fetch full world info with entries, tags, creator and interaction flags; enforces access rules.';

--------------------------------------------------------------------------------
-- 2. list_public_world_infos(
--      p_search text,
--      p_sort text,          -- '' | 'newest' | 'interactions'
--      p_offset int,
--      p_limit int,
--      p_exclude_nsfw boolean DEFAULT false,
--      p_tag_ids int[] DEFAULT NULL -- filter: world info must have ALL of these tags
--    )
-- Returns jsonb: { items: [...], total: n }
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_public_world_infos(
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'interactions',
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 20,
  p_exclude_nsfw boolean DEFAULT false,
  p_tag_ids int[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items jsonb;
  v_total int;
BEGIN
  WITH base AS (
    SELECT wi.*
    FROM world_infos wi
    WHERE wi.visibility = 'public'
      AND (p_search IS NULL OR trim(p_search) = '' OR (
        wi.name ILIKE '%' || replace(p_search, '%','') || '%' OR
        wi.short_description ILIKE '%' || replace(p_search, '%','') || '%'
      ))
  ), nsfw_filtered AS (
    SELECT b.* FROM base b
    WHERE NOT p_exclude_nsfw OR NOT EXISTS (
      SELECT 1 FROM world_info_tags wit
      WHERE wit.world_info_id = b.id AND wit.tag_id = 24 -- NSFW tag id
    )
  ), tag_filtered AS (
    SELECT n.* FROM nsfw_filtered n
    WHERE p_tag_ids IS NULL OR NOT EXISTS (
      -- ensure every tag in p_tag_ids is present
      SELECT 1 FROM (
        SELECT UNNEST(p_tag_ids) AS tid
      ) req
      WHERE NOT EXISTS (
        SELECT 1 FROM world_info_tags wit
        WHERE wit.world_info_id = n.id AND wit.tag_id = req.tid
      )
    )
  ), ranked AS (
    SELECT
      tf.id,
      tf.name,
      tf.short_description,
      tf.creator_id,
      tf.likes_count,
      tf.interaction_count,
      tf.created_at,
      tf.updated_at,
      tf.visibility,
      (SELECT jsonb_build_object('username', p.username, 'avatar_url', p.avatar_url)
         FROM profiles p WHERE p.id = tf.creator_id) AS creator,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', tg.id, 'name', tg.name) ORDER BY tg.name), '[]'::jsonb)
         FROM world_info_tags wit JOIN tags tg ON tg.id = wit.tag_id
         WHERE wit.world_info_id = tf.id) AS tags
    FROM tag_filtered tf
  ), ordered AS (
    SELECT * FROM ranked
    ORDER BY CASE WHEN p_sort = 'newest' THEN created_at END DESC,
             CASE WHEN p_sort <> 'newest' THEN interaction_count END DESC,
             id
    OFFSET GREATEST(p_offset,0) LIMIT LEAST(p_limit,100)
  ), agg AS (
    SELECT
      jsonb_agg(jsonb_build_object(
         'id', o.id,
         'name', o.name,
         'short_description', o.short_description,
         'creator_id', o.creator_id,
         'likes_count', o.likes_count,
         'interaction_count', o.interaction_count,
         'created_at', o.created_at,
         'updated_at', o.updated_at,
         'visibility', o.visibility,
         'creator', o.creator,
         'tags', o.tags
       )) AS items,
      (SELECT COUNT(*) FROM tag_filtered) AS total
    FROM ordered o
  )
  SELECT items, total INTO v_items, v_total FROM agg;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', v_total
  );
END;
$$;

COMMENT ON FUNCTION public.list_public_world_infos(text,text,int,int,boolean,int[]) IS 'List public world infos with filtering, sorting, pagination, and tag/NSFW filters.';

--------------------------------------------------------------------------------
-- 3. list_user_world_infos(p_user_id uuid)
-- Combines owned + collected for the authenticated user (must match auth.uid()).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_user_world_infos(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_items jsonb;
BEGIN
  IF v_auth IS NULL OR v_auth <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH owned AS (
    SELECT wi.* FROM world_infos wi WHERE wi.creator_id = p_user_id
  ), liked AS (
    SELECT wi.*
    FROM world_info_user_likes wul
    JOIN world_infos wi ON wi.id = wul.world_info_id
    WHERE wul.user_id = p_user_id AND wi.creator_id <> p_user_id
  ), unioned AS (
    SELECT * FROM owned
    UNION
    SELECT * FROM liked
  ), enriched AS (
    SELECT u.id, u.name, u.short_description, u.creator_id, u.visibility,
           u.likes_count, u.interaction_count, u.created_at, u.updated_at,
           (SELECT COUNT(*) FROM world_info_entries we WHERE we.world_info_id = u.id) AS entries_count,
           (SELECT jsonb_agg(jsonb_build_object('id', tg.id, 'name', tg.name) ORDER BY tg.name)
              FROM world_info_tags wit JOIN tags tg ON tg.id = wit.tag_id
              WHERE wit.world_info_id = u.id) AS tags,
           (SELECT jsonb_build_object('username', p.username, 'avatar_url', p.avatar_url) FROM profiles p WHERE p.id = u.creator_id) AS creator
    FROM unioned u
  )
  SELECT jsonb_agg(jsonb_build_object(
      'id', e.id,
      'name', e.name,
      'short_description', e.short_description,
      'creator_id', e.creator_id,
      'visibility', e.visibility,
      'likes_count', e.likes_count,
      'interaction_count', e.interaction_count,
      'entriesCount', COALESCE(e.entries_count,0),
      'created_at', e.created_at,
      'updated_at', e.updated_at,
      'tags', COALESCE(e.tags, '[]'::jsonb),
      'creator', e.creator
    )) INTO v_items
  FROM enriched e;

  RETURN COALESCE(v_items, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.list_user_world_infos(uuid) IS 'List world infos owned or collected by the authenticated user.';

--------------------------------------------------------------------------------
-- RLS considerations:
-- These SECURITY DEFINER functions read data directly and enforce access manually.
-- Ensure owner is postgres or a dedicated service role and that EXECUTE is granted minimally.
--------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fetch_world_info_full(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_public_world_infos(text,text,int,int,boolean,int[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_user_world_infos(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fetch_world_info_full(uuid) TO authenticated, anon; -- fetch handles visibility internally
GRANT EXECUTE ON FUNCTION public.list_public_world_infos(text,text,int,int,boolean,int[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.list_user_world_infos(uuid) TO authenticated; -- only authenticated users
