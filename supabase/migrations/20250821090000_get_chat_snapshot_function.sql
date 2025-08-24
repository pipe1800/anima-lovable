-- Migration: create get_chat_snapshot function
-- Description: Consolidated snapshot fetch for chat initial load (messages, context, mode, summary stats)
-- Security: SECURITY DEFINER with ownership + explicit RLS ownership checks via _assert_self
-- NOTE: Ensure this file runs after supporting tables & helper _assert_self are present.

CREATE OR REPLACE FUNCTION public.get_chat_snapshot(
  p_chat_id uuid,
  p_user_id uuid,
  p_character_id uuid,
  p_limit integer DEFAULT 25,
  p_before_order integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, billing, auth
AS $$
DECLARE
  v_context jsonb;
  v_mode text;
  v_last_summary int;
  v_ai_after int;
  v_messages jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_effective_limit int;
BEGIN
  -- Ownership / RLS guard
  PERFORM public._assert_self(p_user_id);

  IF p_chat_id IS NULL OR p_user_id IS NULL OR p_character_id IS NULL THEN
    RAISE EXCEPTION 'Missing required parameters';
  END IF;

  v_effective_limit := LEAST(GREATEST(coalesce(p_limit,25),1),100);

  -- Verify chat belongs to user (prevents leakage even if RLS misconfigured)
  IF NOT EXISTS (SELECT 1 FROM chats WHERE id = p_chat_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Chat not found or access denied';
  END IF;

  -- Chat mode
  SELECT chat_mode INTO v_mode FROM chats WHERE id = p_chat_id;

  -- Context row (already filtered by user & character)
  SELECT current_context::jsonb INTO v_context
    FROM chat_context
   WHERE chat_id = p_chat_id
     AND user_id = p_user_id
     AND character_id = p_character_id;

  -- Latest auto summary message_count
  SELECT message_count INTO v_last_summary
    FROM character_memories
   WHERE chat_id = p_chat_id
     AND is_auto_summary = true
   ORDER BY message_count DESC
   LIMIT 1;

  -- Messages page (DESC by message_order for infinite backward pagination)
  WITH ordered AS (
    SELECT id,
           content,
           is_ai_message,
           created_at,
           message_order,
           current_context
      FROM messages
     WHERE chat_id = p_chat_id
       AND (p_before_order IS NULL OR message_order < p_before_order)
     ORDER BY message_order DESC
     LIMIT v_effective_limit + 1
  ), limited AS (
    SELECT * FROM ordered LIMIT v_effective_limit
  )
  SELECT jsonb_agg(to_jsonb(limited) ORDER BY message_order DESC) INTO v_messages FROM limited;

  -- Has more (if we fetched > limit)
  SELECT (COUNT(*) > v_effective_limit) INTO v_has_more FROM ordered;

  -- AI messages after last summary (excluding placeholders)
  SELECT COUNT(*) INTO v_ai_after
    FROM messages m
   WHERE m.chat_id = p_chat_id
     AND m.is_ai_message IS TRUE
     AND (v_last_summary IS NULL OR m.message_order > v_last_summary)
     AND m.content IS NOT NULL
     AND m.content NOT LIKE '%[PLACEHOLDER]%';

  RETURN jsonb_build_object(
    'chat_id', p_chat_id,
    'chat_mode', v_mode,
    'current_context', coalesce(v_context, '{}'::jsonb),
    'messages', coalesce(v_messages, '[]'::jsonb),
    'has_more', coalesce(v_has_more,false),
    'last_summary_at', coalesce(v_last_summary,0),
    'ai_messages_after_summary', coalesce(v_ai_after,0),
    'page_limit', v_effective_limit,
    'before_order', p_before_order
  );
END;
$$;

COMMENT ON FUNCTION public.get_chat_snapshot(uuid,uuid,uuid,integer,integer) IS 'Return consolidated chat snapshot (messages page, context, mode, summary stats) enforcing ownership.';
