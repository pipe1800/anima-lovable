-- Add selected_persona_id to chats table for persona context tracking
-- This allows each chat to have its own selected persona that persists across sessions

ALTER TABLE public.chats 
ADD COLUMN selected_persona_id uuid,
ADD CONSTRAINT fk_chats_selected_persona 
FOREIGN KEY (selected_persona_id) REFERENCES public.personas(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX idx_chats_selected_persona_id ON public.chats(selected_persona_id);

-- Update existing chats to use the character's default persona if it exists
UPDATE public.chats 
SET selected_persona_id = c.default_persona_id
FROM public.characters c
WHERE public.chats.character_id = c.id 
AND c.default_persona_id IS NOT NULL;
