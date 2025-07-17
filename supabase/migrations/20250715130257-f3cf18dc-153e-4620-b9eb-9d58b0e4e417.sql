-- Add foreign key constraint to message_context table
ALTER TABLE public.message_context 
ADD CONSTRAINT message_context_message_id_fkey 
FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;

-- Add foreign key constraint to messages table for chat_id
ALTER TABLE public.message_context 
ADD CONSTRAINT message_context_chat_id_fkey 
FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE;