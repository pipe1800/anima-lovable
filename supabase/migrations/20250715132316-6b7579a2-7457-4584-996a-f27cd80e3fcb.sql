-- Create index for better performance on message context queries
CREATE INDEX IF NOT EXISTS idx_message_context_message_id_chat_id ON public.message_context(message_id, chat_id);

-- Create index for better performance on messages queries
CREATE INDEX IF NOT EXISTS idx_messages_chat_id_created_at ON public.messages(chat_id, created_at DESC);

-- Create index for better performance on context queries
CREATE INDEX IF NOT EXISTS idx_user_chat_context_user_character_chat ON public.user_chat_context(user_id, character_id, chat_id, context_type);