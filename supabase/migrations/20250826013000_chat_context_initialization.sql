-- Migration: Ensure chat_context row with null fields on chat creation
-- Date: 2025-08-26
-- Purpose: When creating a chat we always create a chat_context row whose current_context
--          has explicit null valued keys (mood, clothing, location, time_weather, relationship, character_position).
--          If a relationship progress row already exists, relationship field will be populated
--          afterward via sync_relationship_context_for_chat; otherwise it stays null.
--          This supports frontend fallback display of initial relationship goal label when no
--          progress state exists yet.

CREATE OR REPLACE FUNCTION public.create_chat_with_greeting(
  p_character_id uuid,
  p_user_id uuid,
  p_user_message text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_chat_id uuid;
  character_name text;
  character_greeting text;
  final_greeting text;
BEGIN
  -- Step 1: Character name for title
  SELECT name INTO character_name FROM public.characters WHERE id = p_character_id;

  -- Step 2: Greeting
  SELECT greeting INTO character_greeting FROM public.character_definitions WHERE character_id = p_character_id;

  -- Step 3: Create chat
  INSERT INTO public.chats (user_id, character_id, title)
  VALUES (p_user_id, p_character_id, 'Chat with ' || character_name)
  RETURNING id INTO new_chat_id;

  -- Step 4: Greeting fallback
  final_greeting := COALESCE(NULLIF(character_greeting, ''), 'Hello! It''s a pleasure to meet you. What''s on your mind?');

  -- Step 5: Insert greeting (AI first message)
  INSERT INTO public.messages (chat_id, author_id, content, is_ai_message)
  VALUES (new_chat_id, p_character_id, final_greeting, true);

  -- Step 6: Optional user first message
  IF p_user_message IS NOT NULL AND p_user_message <> '' THEN
    INSERT INTO public.messages (chat_id, author_id, content, is_ai_message, model_id)
    VALUES (new_chat_id, p_user_id, p_user_message, false, NULL);
  END IF;

  -- Step 7: Create blank chat_context row (idempotent) with explicit null fields
  INSERT INTO public.chat_context (chat_id, user_id, character_id, current_context, updated_at)
  VALUES (
    new_chat_id,
    p_user_id,
    p_character_id,
    jsonb_build_object(
      'mood', NULL,
      'clothing', NULL,
      'location', NULL,
      'time_weather', NULL,
      'relationship', NULL,
      'character_position', NULL
    ),
    now()
  )
  ON CONFLICT (chat_id) DO NOTHING;

  -- Step 8: Attempt relationship context sync (best effort)
  BEGIN
    PERFORM public.sync_relationship_context_for_chat(p_user_id, p_character_id, new_chat_id);
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'relationship context sync failed: %', SQLERRM;
  END;

  RETURN new_chat_id;
END;$$;

GRANT EXECUTE ON FUNCTION public.create_chat_with_greeting(uuid, uuid, text) TO anon, authenticated, service_role;
