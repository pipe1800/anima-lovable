-- Fix the user_chat_context constraint to include character_position
-- First drop existing constraint if it exists
ALTER TABLE user_chat_context DROP CONSTRAINT IF EXISTS user_chat_context_context_type_check;

-- Create new constraint that includes character_position
ALTER TABLE user_chat_context ADD CONSTRAINT user_chat_context_context_type_check 
CHECK (context_type IN ('mood', 'clothing', 'location', 'time_weather', 'relationship', 'character_position'));