-- Add conversation_tone and urgency_level to chat_context current_context jsonb structure
-- This migration updates the default value to include the new fields

-- Update the default value for current_context to include conversation_tone and urgency_level
ALTER TABLE public.chat_context 
ALTER COLUMN current_context SET DEFAULT '{"mood": null, "clothing": null, "location": null, "relationship": null, "time_weather": null, "character_position": null, "conversation_tone": null, "urgency_level": null}'::jsonb;

-- Update existing records to include the new fields (only add if they don't exist)
UPDATE public.chat_context 
SET current_context = current_context || '{"conversation_tone": null, "urgency_level": null}'::jsonb
WHERE current_context ? 'conversation_tone' = false OR current_context ? 'urgency_level' = false;
