-- Function to safely delete a chat and all related data
CREATE OR REPLACE FUNCTION delete_chat_complete(p_chat_id uuid, p_user_id uuid)
RETURNS void AS $$
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM chats 
    WHERE id = p_chat_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Chat not found or access denied';
  END IF;

  -- Delete in correct order to respect foreign key constraints
  
  -- 1. Delete character memories associated with this chat
  DELETE FROM character_memories 
  WHERE chat_id = p_chat_id;
  
  -- 2. Delete chat context
  DELETE FROM chat_context 
  WHERE chat_id = p_chat_id;
  
  -- 3. Delete messages (this should cascade automatically, but being explicit)
  DELETE FROM messages 
  WHERE chat_id = p_chat_id;
  
  -- 4. Finally delete the chat itself
  DELETE FROM chats 
  WHERE id = p_chat_id AND user_id = p_user_id;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_chat_complete(uuid, uuid) TO authenticated;
