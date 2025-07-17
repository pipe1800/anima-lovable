-- Create user_character_addons table for user-specific addon settings
CREATE TABLE IF NOT EXISTS public.user_character_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  addon_settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, character_id)
);

-- Enable Row Level Security
ALTER TABLE public.user_character_addons ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can manage their own character addon settings" 
  ON public.user_character_addons FOR ALL 
  USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE TRIGGER update_user_character_addons_updated_at
  BEFORE UPDATE ON public.user_character_addons
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Also need to add character tags to the character profile queries
-- First, let's check if we need to add any missing relationships for tags