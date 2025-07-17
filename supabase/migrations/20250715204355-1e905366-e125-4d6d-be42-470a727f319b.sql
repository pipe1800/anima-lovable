-- Add unique constraint to user_chat_context table for upsert operations
ALTER TABLE user_chat_context 
ADD CONSTRAINT unique_user_chat_context 
UNIQUE (user_id, chat_id, character_id, context_type);

-- Create index for better performance on context queries
CREATE INDEX idx_user_chat_context_lookup 
ON user_chat_context (user_id, chat_id, character_id, context_type);

-- Create index for context type filtering
CREATE INDEX idx_user_chat_context_type 
ON user_chat_context (context_type);