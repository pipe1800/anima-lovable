-- Rename columns in character_definitions table to be more descriptive
ALTER TABLE public.character_definitions 
RENAME COLUMN long_description TO description;

ALTER TABLE public.character_definitions 
RENAME COLUMN definition TO personality_summary;

ALTER TABLE public.character_definitions 
RENAME COLUMN contextual_data TO scenario;

-- Add default_persona_id column to characters table with foreign key constraint
ALTER TABLE public.characters 
ADD COLUMN default_persona_id uuid;

-- Add foreign key constraint referencing personas table
ALTER TABLE public.characters 
ADD CONSTRAINT fk_characters_default_persona 
FOREIGN KEY (default_persona_id) REFERENCES public.personas(id) ON DELETE SET NULL;