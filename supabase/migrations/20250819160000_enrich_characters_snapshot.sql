-- Enrich snapshot characters & favorites_full with extended fields (tagline, favorites_count, messages_count, was_public, created_at, character_definitions, tags)
-- Date: 2025-08-19
-- NOTE: Still version=3 (no bump) to avoid churn; clients must tolerate added fields.

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
  v_favorites_full jsonb := '[]'::jsonb;
  v_tags jsonb := '[]'::jsonb;
  v_stats jsonb;
  sub_source text := NULL;
  plan_source text := NULL;
  credits_source text := NULL;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT to_jsonb(p) - 'email' INTO v_profile FROM profiles p WHERE p.id = v_uid;

  SELECT jsonb_build_object('id', s.id, 'status', s.status, 'plan_id', s.plan_id,
                            'current_period_end', s.current_period_end, 'created_at', s.created_at)
    INTO v_subscription FROM subscriptions s WHERE s.user_id = v_uid ORDER BY s.created_at DESC LIMIT 1;
  IF v_subscription IS NULL THEN BEGIN
    SELECT jsonb_build_object('id', s.id, 'status', s.status, 'plan_id', s.plan_id,
                              'current_period_end', s.current_period_end, 'created_at', s.created_at)
      INTO v_subscription FROM billing.subscriptions s WHERE s.user_id = v_uid ORDER BY s.created_at DESC LIMIT 1;
  EXCEPTION WHEN undefined_table THEN NULL; END; END IF;
  IF v_subscription IS NULL THEN BEGIN
    SELECT jsonb_build_object('id', s.id, 'status', s.status, 'plan_id', s.plan_id,
                              'current_period_end', s.current_period_end, 'created_at', s.created_at)
      INTO v_subscription FROM subscriptions_legacy s WHERE s.user_id = v_uid ORDER BY s.created_at DESC LIMIT 1;
  EXCEPTION WHEN undefined_table THEN NULL; END; END IF;
  IF v_subscription IS NOT NULL THEN
    SELECT to_jsonb(pl) INTO v_plan FROM plans pl WHERE pl.id = (v_subscription->>'plan_id')::uuid;
    IF v_plan IS NULL THEN BEGIN SELECT to_jsonb(pl) INTO v_plan FROM billing.plans pl WHERE pl.id = (v_subscription->>'plan_id')::uuid; EXCEPTION WHEN undefined_table THEN NULL; END; END IF;
    IF v_plan IS NULL THEN BEGIN SELECT to_jsonb(pl) INTO v_plan FROM plans_legacy pl WHERE pl.id = (v_subscription->>'plan_id')::uuid; EXCEPTION WHEN undefined_table THEN NULL; END; END IF;
    IF v_plan IS NOT NULL THEN v_subscription := v_subscription || jsonb_build_object('plan', v_plan); END IF;
  END IF;

  SELECT jsonb_build_object('balance', c.balance) INTO v_credits FROM credits c WHERE c.user_id = v_uid;
  IF v_credits IS NULL THEN BEGIN SELECT jsonb_build_object('balance', c.balance) INTO v_credits FROM billing.credits c WHERE c.user_id = v_uid; EXCEPTION WHEN undefined_table THEN NULL; END; END IF;
  IF v_credits IS NULL THEN BEGIN SELECT jsonb_build_object('balance', c.balance) INTO v_credits FROM credits_legacy c WHERE c.user_id = v_uid; EXCEPTION WHEN undefined_table THEN NULL; END; END IF;
  IF v_credits IS NULL THEN v_credits := jsonb_build_object('balance',0); END IF;

  SELECT to_jsonb(gs) INTO v_settings FROM user_global_chat_settings gs WHERE gs.user_id = v_uid;

  SELECT COALESCE(jsonb_agg(to_jsonb(pn) - 'bio' - 'lore'), '[]'::jsonb) INTO v_personas FROM (
    SELECT id, name, avatar_url, updated_at
    FROM personas WHERE user_id = v_uid ORDER BY updated_at DESC LIMIT 100
  ) pn;

  -- Enriched owned characters: include extended counters + definitions + tags
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'short_description', c.short_description,
    'tagline', c.tagline,
    'avatar_url', c.avatar_url,
    'visibility', c.visibility,
    'interaction_count', c.interaction_count,
    'chats_count', c.chats_count,
    'messages_count', c.messages_count,
    'likes_count', c.likes_count,
    'favorites_count', c.favorites_count,
    'was_public', c.was_public,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'character_definitions', c.character_definitions,
    'tags', c.tags
  )), '[]'::jsonb) INTO v_characters
  FROM (
    SELECT id, name, short_description, tagline, avatar_url, visibility, interaction_count, chats_count,
           messages_count, likes_count, favorites_count, was_public, created_at, updated_at, character_definitions, tags
    FROM character_profile_view
    WHERE creator_id = v_uid
    ORDER BY updated_at DESC LIMIT 100
  ) c;

  -- Recent chats derivation (unchanged from previous enriched version)
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', rc.id,
      'title', rc.title,
      'last_message_at', rc.last_message_at,
      'character_id', rc.character_id,
      'character_name', rc.character_name,
      'character_avatar_url', rc.character_avatar_url,
      'last_message', rc.last_message,
      'last_message_is_ai', rc.last_message_is_ai,
      'message_count', rc.message_count
    )), '[]'::jsonb)
    INTO v_recent_chats
    FROM (
      SELECT ch.id,
             ch.title,
             ch.last_message_at,
             ch.character_id,
             cpv.name AS character_name,
             cpv.avatar_url AS character_avatar_url,
             lm.content AS last_message,
             lm.is_ai_message AS last_message_is_ai,
             mc.message_count
      FROM chats ch
      LEFT JOIN character_profile_view cpv ON cpv.id = ch.character_id
      LEFT JOIN LATERAL (
        SELECT m.content, m.is_ai_message FROM messages m WHERE m.chat_id = ch.id ORDER BY m.created_at DESC LIMIT 1
      ) lm ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS message_count FROM messages m2 WHERE m2.chat_id = ch.id
      ) mc ON TRUE
      WHERE ch.user_id = v_uid
      ORDER BY COALESCE(ch.last_message_at, ch.created_at) DESC
      LIMIT 25
    ) rc;
  EXCEPTION WHEN undefined_table THEN v_recent_chats := '[]'::jsonb; END;

  SELECT COALESCE(jsonb_agg(x.id), '[]'::jsonb) INTO v_favorite_ids FROM (
    SELECT cf.character_id AS id
    FROM character_favorites cf
    JOIN characters ch ON ch.id = cf.character_id AND ch.visibility='public'
    WHERE cf.user_id = v_uid ORDER BY cf.created_at DESC LIMIT 500
  ) x;

  -- favorites_full enriched
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'short_description', c.short_description,
      'tagline', c.tagline,
      'avatar_url', c.avatar_url,
      'visibility', c.visibility,
      'interaction_count', c.interaction_count,
      'chats_count', c.chats_count,
      'messages_count', c.messages_count,
      'likes_count', c.likes_count,
      'favorites_count', c.favorites_count,
      'updated_at', c.updated_at,
      'created_at', c.created_at,
      'creator_username', u.username
    )), '[]'::jsonb) INTO v_favorites_full
    FROM character_favorites cf
    JOIN characters c ON c.id = cf.character_id AND c.visibility='public'
    LEFT JOIN profiles u ON u.id = c.creator_id
    WHERE cf.user_id = v_uid
    ORDER BY cf.created_at DESC LIMIT 200;
  EXCEPTION WHEN others THEN v_favorites_full := '[]'::jsonb; END;

  BEGIN
    SELECT COALESCE(jsonb_agg(t.name), '[]'::jsonb) INTO v_tags
    FROM tags t JOIN user_tags ut ON ut.tag_id = t.id AND ut.user_id = v_uid;
  EXCEPTION WHEN undefined_table THEN v_tags := '[]'::jsonb; END;

  v_stats := jsonb_build_object(
    'total_chats',(SELECT count(*) FROM chats ch WHERE ch.user_id=v_uid),
    'total_characters',jsonb_array_length(v_characters),
    'total_personas',jsonb_array_length(v_personas),
    'total_favorites',jsonb_array_length(v_favorite_ids)
  );

  RETURN jsonb_build_object(
    'version',3,
    'generated_at',to_char(v_now,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'user_id',v_uid,
    'included_sections',ARRAY['profile','subscription','credits','personas','characters','recent_chats','favorites','favorites_full','tags','settings','stats']::text[],
    'profile',COALESCE(v_profile,NULL::jsonb),
    'subscription',COALESCE(v_subscription,NULL::jsonb),
    'credits',v_credits,
    'user_global_chat_settings',COALESCE(v_settings,NULL::jsonb),
    'personas',v_personas,
    'characters',v_characters,
    'recent_chats',v_recent_chats,
    'favorite_character_ids',v_favorite_ids,
    'favorites_full', v_favorites_full,
    'tags',v_tags,
    'stats',v_stats
  );
END;
$$;

COMMENT ON FUNCTION public.get_user_snapshot_v2() IS 'V3 enriched with extended character fields & favorites_full.';
GRANT EXECUTE ON FUNCTION public.get_user_snapshot_v2() TO authenticated;
NOTIFY pgrst, 'reload schema';
