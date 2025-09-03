-- Migration: Add chat bootstrap snapshot RPC
-- Purpose: Consolidate initial chat hydration (profile + persona + minimal character + current context + relationship snapshot + latest ai message)
-- Optional memory prefetch (disabled by default)

CREATE OR REPLACE FUNCTION public.get_chat_bootstrap_snapshot(
  p_user_id uuid,
  p_chat_id uuid,
  p_character_id uuid,
  p_include_memories boolean DEFAULT false,
  p_memory_limit int DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile jsonb := '{}'::jsonb;
  v_persona jsonb := 'null'::jsonb;
  v_character jsonb := '{}'::jsonb;
  v_context jsonb := 'null'::jsonb;
  v_relationship jsonb := 'null'::jsonb;
  v_latest_ai jsonb := 'null'::jsonb;
  v_memories jsonb := 'null'::jsonb;
  v_default_persona_id uuid;
  v_selected_persona_id uuid;
BEGIN
  -- Profile
  SELECT to_jsonb(r) - 'default_persona_id' INTO v_profile
  FROM (
    SELECT username, timezone, default_persona_id FROM profiles WHERE id = p_user_id
  ) r;

  -- Chat selected persona
  SELECT selected_persona_id INTO v_selected_persona_id FROM chats WHERE id = p_chat_id AND user_id = p_user_id;
  -- Profile default persona id
  SELECT default_persona_id INTO v_default_persona_id FROM profiles WHERE id = p_user_id;

  IF v_selected_persona_id IS NOT NULL THEN
    SELECT to_jsonb(p.*) - 'id' - 'user_id' INTO v_persona FROM (
      SELECT name, bio, lore FROM personas WHERE id = v_selected_persona_id AND user_id = p_user_id
    ) p;
  END IF;

  IF (v_persona IS NULL OR v_persona = 'null'::jsonb) AND v_default_persona_id IS NOT NULL THEN
    SELECT to_jsonb(p.*) - 'id' - 'user_id' INTO v_persona FROM (
      SELECT name, bio, lore FROM personas WHERE id = v_default_persona_id AND user_id = p_user_id
    ) p;
  END IF;

  IF (v_persona IS NULL OR v_persona = 'null'::jsonb) THEN
    SELECT to_jsonb(p.*) - 'id' - 'user_id' INTO v_persona FROM (
      SELECT name, bio, lore FROM personas WHERE user_id = p_user_id ORDER BY created_at ASC LIMIT 1
    ) p;
  END IF;

  -- Character minimal info
  SELECT to_jsonb(c) INTO v_character FROM (
    SELECT id, name, greeting, personality_summary FROM characters WHERE id = p_character_id
  ) c;

  -- Context
  SELECT to_jsonb(r) INTO v_context FROM (
    SELECT current_context FROM chat_context WHERE chat_id = p_chat_id AND user_id = p_user_id AND character_id = p_character_id
  ) r;
  IF v_context IS NULL THEN v_context := 'null'::jsonb; END IF;

  -- Relationship snapshot (ignore errors)
  BEGIN
    v_relationship := public.get_or_evaluate_relationship_snapshot(p_user_id, p_character_id, false, true);
  EXCEPTION WHEN others THEN
    v_relationship := 'null'::jsonb;
  END;

  -- Latest AI message
  SELECT to_jsonb(m) INTO v_latest_ai FROM (
    SELECT id, content, message_order, created_at FROM messages WHERE chat_id = p_chat_id AND is_ai_message = true ORDER BY message_order DESC LIMIT 1
  ) m;
  IF v_latest_ai IS NULL THEN v_latest_ai := 'null'::jsonb; END IF;

  -- Optional curated memories
  IF p_include_memories THEN
    SELECT jsonb_agg(row_to_json(mem)) INTO v_memories FROM (
      SELECT id, summary_content, trigger_keywords, created_at
      FROM character_memories
      WHERE user_id = p_user_id AND character_id = p_character_id AND is_auto_summary = false
      ORDER BY updated_at DESC
      LIMIT GREATEST(1, LEAST(p_memory_limit, 100))
    ) mem;
    IF v_memories IS NULL THEN v_memories := '[]'::jsonb; END IF;
  END IF;

  RETURN jsonb_build_object(
    'profile', COALESCE(v_profile, '{}'::jsonb),
    'persona', v_persona,
    'character', v_character,
    'context', v_context,
    'relationship', v_relationship,
    'latest_ai_message', v_latest_ai,
    'memories', v_memories
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_chat_bootstrap_snapshot(uuid, uuid, uuid, boolean, int) TO authenticated, service_role;
