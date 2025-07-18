-- Fix author_id column to allow NULL for AI messages
-- This allows AI messages to have NULL author_id while user messages have the user's ID

-- Remove the NOT NULL constraint from author_id
ALTER TABLE public.messages ALTER COLUMN author_id DROP NOT NULL;

-- Update any existing AI messages that might have incorrect author_id values
UPDATE public.messages 
SET author_id = NULL 
WHERE is_ai_message = true AND author_id IS NOT NULL;

-- Add a check constraint to ensure data integrity:
-- - AI messages (is_ai_message = true) can have NULL author_id
-- - User messages (is_ai_message = false) must have a non-NULL author_id
ALTER TABLE public.messages ADD CONSTRAINT messages_author_id_check 
  CHECK (
    (is_ai_message = true AND author_id IS NULL) OR 
    (is_ai_message = false AND author_id IS NOT NULL)
  );
