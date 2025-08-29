-- Migration: Update create_chat_with_greeting to sync relationship context per new chat
-- Calls sync_relationship_context_for_chat after inserting chat & initial messages

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
  -- Step 1: Get character's name for the chat title
  SELECT name INTO character_name FROM public.characters WHERE id = p_character_id;

  -- Step 2: Get character's greeting
  SELECT greeting INTO character_greeting FROM public.character_definitions WHERE character_id = p_character_id;

  -- Step 3: Create chat
  INSERT INTO public.chats (user_id, character_id, title)
  VALUES (p_user_id, p_character_id, 'Chat with ' || character_name)
  RETURNING id INTO new_chat_id;

  -- Step 4: Greeting fallback
  final_greeting := COALESCE(NULLIF(character_greeting, ''), 'Hello! It''s a pleasure to meet you. What''s on your mind?');

  -- Step 5: Insert greeting
  INSERT INTO public.messages (chat_id, author_id, content, is_ai_message)
  VALUES (new_chat_id, p_character_id, final_greeting, true);

  -- Step 6: Optional user first message
  IF p_user_message IS NOT NULL AND p_user_message <> '' THEN
    INSERT INTO public.messages (chat_id, author_id, content, is_ai_message, model_id)
    VALUES (new_chat_id, p_user_id, p_user_message, false, NULL);
  END IF;

  -- Step 7: Sync relationship context (best effort)
  BEGIN
    PERFORM public.sync_relationship_context_for_chat(p_user_id, p_character_id, new_chat_id);
  EXCEPTION WHEN others THEN
    -- Do not fail chat creation if sync fails
    RAISE NOTICE 'relationship context sync failed: %', SQLERRM;
  END;

  RETURN new_chat_id;
END;$$;

GRANT EXECUTE ON FUNCTION public.create_chat_with_greeting(uuid, uuid, text) TO anon, authenticated, service_role;
