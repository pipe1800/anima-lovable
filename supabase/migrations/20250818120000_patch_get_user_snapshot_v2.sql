-- Migration: patch get_user_snapshot_v2 to be resilient to missing plan / legacy locations
-- Date: 2025-08-18
-- Goal: Fix dashboard showing 0 credits & Guest Pass when data exists in billing.* or legacy tables.
-- Changes:
--  1. Use LEFT JOIN LATERAL for plan so subscription isn't discarded if plan missing.
--  2. Fallback order for subscription: public.subscriptions -> billing.subscriptions -> subscriptions_legacy.
--  3. Fallback order for plan: public.plans -> billing.plans -> plans_legacy.
--  4. Fallback order for credits: public.credits -> billing.credits -> credits_legacy.
--  5. Add debug metadata: debug.subscription_source, debug.plan_source, debug.credits_source.
--  6. Preserve version=2 to avoid breaking front-end type guards; added fields are additive.
--  7. Keep existing included_sections list.

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
  v_plan jsonb;
  v_credits jsonb;
  v_settings jsonb;
  v_personas jsonb := '[]'::jsonb;
  v_characters jsonb := '[]'::jsonb;
  v_recent_chats jsonb := '[]'::jsonb;
  v_favorite_ids jsonb := '[]'::jsonb;
  v_tags jsonb := '[]'::jsonb;
  v_stats jsonb;
  -- debug sources
  sub_source text := NULL;
  plan_source text := NULL;
  credits_source text := NULL;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  -- Profile (strip email)
  SELECT to_jsonb(p) - 'email' INTO v_profile FROM profiles p WHERE p.id = v_uid;

  -- Subscription lookups with fallbacks -------------------------------------------------------
  -- Primary (public)
  SELECT jsonb_build_object('id', s.id, 'status', s.status, 'plan_id', s.plan_id,
                            'current_period_end', s.current_period_end, 'created_at', s.created_at)
    INTO v_subscription
  FROM subscriptions s
  WHERE s.user_id = v_uid
  ORDER BY s.created_at DESC
  LIMIT 1;
  IF v_subscription IS NOT NULL THEN sub_source := 'public.subscriptions'; END IF;

  -- Fallback billing.subscriptions
  IF v_subscription IS NULL THEN
    BEGIN
      SELECT jsonb_build_object('id', s.id, 'status', s.status, 'plan_id', s.plan_id,
                                'current_period_end', s.current_period_end, 'created_at', s.created_at)
        INTO v_subscription
      FROM billing.subscriptions s
      WHERE s.user_id = v_uid
      ORDER BY s.created_at DESC
      LIMIT 1;
      IF v_subscription IS NOT NULL THEN sub_source := 'billing.subscriptions'; END IF;
    EXCEPTION WHEN undefined_table THEN NULL; END;
  END IF;

  -- Fallback legacy
  IF v_subscription IS NULL THEN
    BEGIN
      SELECT jsonb_build_object('id', s.id, 'status', s.status, 'plan_id', s.plan_id,
                                'current_period_end', s.current_period_end, 'created_at', s.created_at)
        INTO v_subscription
      FROM subscriptions_legacy s
      WHERE s.user_id = v_uid
      ORDER BY s.created_at DESC
      LIMIT 1;
      IF v_subscription IS NOT NULL THEN sub_source := 'subscriptions_legacy'; END IF;
    EXCEPTION WHEN undefined_table THEN NULL; END;
  END IF;

  -- Plan (only if subscription present) -------------------------------------------------------
  IF v_subscription IS NOT NULL THEN
    -- public.plans
    SELECT to_jsonb(pl) INTO v_plan FROM plans pl WHERE pl.id = (v_subscription->>'plan_id')::uuid;
    IF v_plan IS NOT NULL THEN plan_source := 'public.plans'; END IF;
    -- billing.plans fallback
    IF v_plan IS NULL THEN
      BEGIN
        SELECT to_jsonb(pl) INTO v_plan FROM billing.plans pl WHERE pl.id = (v_subscription->>'plan_id')::uuid;
        IF v_plan IS NOT NULL THEN plan_source := 'billing.plans'; END IF;
      EXCEPTION WHEN undefined_table THEN NULL; END;
    END IF;
    -- legacy plans
    IF v_plan IS NULL THEN
      BEGIN
        SELECT to_jsonb(pl) INTO v_plan FROM plans_legacy pl WHERE pl.id = (v_subscription->>'plan_id')::uuid;
        IF v_plan IS NOT NULL THEN plan_source := 'plans_legacy'; END IF;
      EXCEPTION WHEN undefined_table THEN NULL; END;
    END IF;
    IF v_plan IS NOT NULL THEN
      v_subscription := v_subscription || jsonb_build_object('plan', v_plan);
    END IF;
  END IF;

  -- Credits with fallbacks --------------------------------------------------------------------
  SELECT jsonb_build_object('balance', c.balance) INTO v_credits FROM credits c WHERE c.user_id = v_uid;
  IF v_credits IS NOT NULL THEN credits_source := 'public.credits'; END IF;

  IF v_credits IS NULL THEN
    BEGIN
      SELECT jsonb_build_object('balance', c.balance) INTO v_credits FROM billing.credits c WHERE c.user_id = v_uid;
      IF v_credits IS NOT NULL THEN credits_source := 'billing.credits'; END IF;
    EXCEPTION WHEN undefined_table THEN NULL; END;
  END IF;

  IF v_credits IS NULL THEN
    BEGIN
      SELECT jsonb_build_object('balance', c.balance) INTO v_credits FROM credits_legacy c WHERE c.user_id = v_uid;
      IF v_credits IS NOT NULL THEN credits_source := 'credits_legacy'; END IF;
    EXCEPTION WHEN undefined_table THEN NULL; END;
  END IF;

  IF v_credits IS NULL THEN
    v_credits := jsonb_build_object('balance', 0);
    credits_source := COALESCE(credits_source, 'default_zero');
  END IF;

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
    'stats', v_stats,
    'debug', jsonb_build_object(
      'subscription_source', sub_source,
      'plan_source', plan_source,
      'credits_source', credits_source
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_user_snapshot_v2() IS 'V2 unified user snapshot (resilient version with fallbacks and debug sources).';
GRANT EXECUTE ON FUNCTION public.get_user_snapshot_v2() TO authenticated;

-- Prompt PostgREST to reload
NOTIFY pgrst, 'reload schema';
