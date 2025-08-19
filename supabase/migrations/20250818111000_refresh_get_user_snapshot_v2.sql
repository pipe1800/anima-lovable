-- Migration: refresh get_user_snapshot_v2 (idempotent)
-- Purpose: Ensure function body matches application expectation (no monthly_used, unified v2 payload)
-- Safe to re-run.

-- =============================
-- UP
-- =============================

-- Drop existing to avoid stale definition (explicit signature, no params)
DROP FUNCTION IF EXISTS public.get_user_snapshot_v2();

CREATE OR REPLACE FUNCTION public.get_user_snapshot_v2()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_profile jsonb;
  v_subscription jsonb;
  v_credits jsonb;
  v_settings jsonb;
  v_personas jsonb := '[]'::jsonb;
  v_characters jsonb := '[]'::jsonb;
  v_recent_chats jsonb := '[]'::jsonb;
  v_favorite_ids jsonb := '[]'::jsonb;
  v_tags jsonb := '[]'::jsonb;
  v_stats jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  -- Profile
  SELECT to_jsonb(p) - 'email' INTO v_profile FROM profiles p WHERE p.id = v_uid;

  -- Subscription + embedded plan (single query join). If RLS blocks either table, result null.
  SELECT to_jsonb(sub_row) || jsonb_build_object('plan', to_jsonb(pl_row)) INTO v_subscription
  FROM (
    SELECT s.id, s.status, s.plan_id, s.current_period_end, s.created_at
    FROM subscriptions s
    WHERE s.user_id = v_uid
    ORDER BY s.created_at DESC
    LIMIT 1
  ) sub_row
  JOIN LATERAL (
    SELECT pl.id, pl.name, pl.price_monthly, pl.monthly_credits_allowance, pl.features
    FROM plans pl
    WHERE pl.id = sub_row.plan_id
  ) pl_row ON TRUE;

  -- Credits row (if policy blocks, returns null -> fallback 0)
  SELECT jsonb_build_object('balance', c.balance) INTO v_credits FROM credits c WHERE c.user_id = v_uid;
  IF v_credits IS NULL THEN v_credits := jsonb_build_object('balance',0); END IF;

  -- Settings
  SELECT to_jsonb(gs) INTO v_settings FROM user_global_chat_settings gs WHERE gs.user_id = v_uid;

  -- Personas
  SELECT COALESCE(jsonb_agg(to_jsonb(pn) - 'bio' - 'lore'), '[]'::jsonb) INTO v_personas
  FROM (
    SELECT id, name, avatar_url, updated_at
    FROM personas
    WHERE user_id = v_uid
    ORDER BY updated_at DESC
    LIMIT 100
  ) pn;

  -- Characters
  SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb) INTO v_characters
  FROM (
    SELECT id, name, short_description, avatar_url, visibility, interaction_count,
           chats_count, likes_count, updated_at
    FROM character_profile_view
    WHERE creator_id = v_uid
    ORDER BY updated_at DESC
    LIMIT 100
  ) c;

  -- Favorites
  SELECT COALESCE(jsonb_agg(x.id), '[]'::jsonb) INTO v_favorite_ids
  FROM (
    SELECT cf.character_id AS id
    FROM character_favorites cf
    JOIN characters ch ON ch.id = cf.character_id AND ch.visibility = 'public'
    WHERE cf.user_id = v_uid
    ORDER BY cf.created_at DESC
    LIMIT 500
  ) x;

  -- Tags (safe)
  BEGIN
    SELECT COALESCE(jsonb_agg(t.name), '[]'::jsonb) INTO v_tags
    FROM tags t JOIN user_tags ut ON ut.tag_id = t.id AND ut.user_id = v_uid;
  EXCEPTION WHEN undefined_table THEN v_tags := '[]'::jsonb; END;

  -- Stats
  v_stats := jsonb_build_object(
    'total_chats', (SELECT count(*) FROM chats ch WHERE ch.user_id = v_uid),
    'total_characters', jsonb_array_length(v_characters),
    'total_personas', jsonb_array_length(v_personas),
    'total_favorites', jsonb_array_length(v_favorite_ids)
  );

  RETURN jsonb_build_object(
    'version', 2,
    'generated_at', to_char(v_now,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'user_id', v_uid,
    'included_sections', ARRAY['profile','subscription','credits','personas','characters','recent_chats','favorites','tags','settings','stats']::text[],
    'profile', COALESCE(v_profile, NULL::jsonb),
    'subscription', COALESCE(v_subscription, NULL::jsonb),
    'credits', v_credits,
    'user_global_chat_settings', COALESCE(v_settings, NULL::jsonb),
    'personas', v_personas,
    'characters', v_characters,
    'recent_chats', v_recent_chats,
    'favorite_character_ids', v_favorite_ids,
    'tags', v_tags,
    'stats', v_stats
  );
END;
$$;

COMMENT ON FUNCTION public.get_user_snapshot_v2() IS 'V2 unified user snapshot with embedded plan join.';
GRANT EXECUTE ON FUNCTION public.get_user_snapshot_v2() TO authenticated;

-- Force PostgREST schema cache reload (Supabase picks up function immediately, but this is a safety ping)
NOTIFY pgrst, 'reload schema';

-- =============================
-- DOWN (best effort)
-- =============================
-- WARNING: Only drops the v2 function; re-create manually if needed.
-- DROP FUNCTION IF EXISTS public.get_user_snapshot_v2();
