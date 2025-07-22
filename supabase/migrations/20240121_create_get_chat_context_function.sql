-- Create function to get chat context
CREATE OR REPLACE FUNCTION get_chat_context(
  p_chat_id UUID,
  p_user_id UUID,
  p_character_id UUID
)
RETURNS TABLE(current_context JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT cc.current_context
  FROM chat_context cc
  WHERE cc.chat_id = p_chat_id
    AND cc.user_id = p_user_id
    AND cc.character_id = p_character_id
  LIMIT 1;
END;
$$;
