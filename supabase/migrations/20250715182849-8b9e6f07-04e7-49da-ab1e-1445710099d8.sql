-- Add current_context column to messages table for context inheritance
ALTER TABLE public.messages 
ADD COLUMN current_context jsonb DEFAULT null;

-- Add index for better performance when querying by context
CREATE INDEX idx_messages_current_context ON public.messages USING GIN(current_context) WHERE current_context IS NOT NULL;