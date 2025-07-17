-- Create user-specific world info settings table
CREATE TABLE public.user_character_world_info_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  character_id UUID NOT NULL,
  world_info_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure one world info per user-character combination
  UNIQUE(user_id, character_id)
);

-- Enable Row Level Security
ALTER TABLE public.user_character_world_info_settings ENABLE ROW LEVEL SECURITY;

-- Users can only access their own world info settings
CREATE POLICY "Users can manage their own world info settings" 
ON public.user_character_world_info_settings 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_user_character_world_info_settings_user_id 
ON public.user_character_world_info_settings(user_id);

CREATE INDEX idx_user_character_world_info_settings_character_id 
ON public.user_character_world_info_settings(character_id);

CREATE INDEX idx_user_character_world_info_settings_world_info_id 
ON public.user_character_world_info_settings(world_info_id);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_user_character_world_info_settings_updated_at
BEFORE UPDATE ON public.user_character_world_info_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();