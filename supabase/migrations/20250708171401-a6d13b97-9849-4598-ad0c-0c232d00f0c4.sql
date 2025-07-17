-- Create world_infos table (mirrors characters table)
CREATE TABLE public.world_infos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL,
  name TEXT NOT NULL,
  short_description TEXT,
  avatar_url TEXT,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'unlisted', 'private')),
  interaction_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create world_info_entries table (holds the actual lore)
CREATE TABLE public.world_info_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  world_info_id UUID NOT NULL REFERENCES public.world_infos(id) ON DELETE CASCADE,
  keywords TEXT[] NOT NULL,
  entry_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create world_info_likes table (mirrors character_likes)
CREATE TABLE public.world_info_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  world_info_id UUID NOT NULL REFERENCES public.world_infos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(world_info_id, user_id)
);

-- Create world_info_favorites table (mirrors character_favorites)
CREATE TABLE public.world_info_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  world_info_id UUID NOT NULL REFERENCES public.world_infos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(world_info_id, user_id)
);

-- Create character_world_info_link table for many-to-many relationship
CREATE TABLE public.character_world_info_link (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  world_info_id UUID NOT NULL REFERENCES public.world_infos(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(character_id, world_info_id)
);

-- Enable Row Level Security on all tables
ALTER TABLE public.world_infos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.world_info_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.world_info_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.world_info_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_world_info_link ENABLE ROW LEVEL SECURITY;

-- RLS policies for world_infos (mirrors characters policies)
CREATE POLICY "Public world infos are viewable by everyone" ON public.world_infos
  FOR SELECT USING (visibility = 'public');

CREATE POLICY "Users can view own world infos" ON public.world_infos
  FOR SELECT USING (auth.uid() = creator_id);

CREATE POLICY "Users can insert own world infos" ON public.world_infos
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Users can update own world infos" ON public.world_infos
  FOR UPDATE USING (auth.uid() = creator_id);

CREATE POLICY "Users can delete own world infos" ON public.world_infos
  FOR DELETE USING (auth.uid() = creator_id);

-- RLS policies for world_info_entries
CREATE POLICY "World info entries follow world info permissions" ON public.world_info_entries
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.world_infos 
      WHERE world_infos.id = world_info_entries.world_info_id 
      AND (world_infos.visibility = 'public' OR world_infos.creator_id = auth.uid())
    )
  );

-- RLS policies for world_info_likes (mirrors character_likes)
CREATE POLICY "Users can view all world info likes" ON public.world_info_likes
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own world info likes" ON public.world_info_likes
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS policies for world_info_favorites (mirrors character_favorites)
CREATE POLICY "Users can view all world info favorites" ON public.world_info_favorites
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own world info favorites" ON public.world_info_favorites
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS policies for character_world_info_link
CREATE POLICY "Users can view character world info links for accessible characters" ON public.character_world_info_link
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.characters 
      WHERE characters.id = character_world_info_link.character_id 
      AND (characters.visibility = 'public' OR characters.creator_id = auth.uid())
    )
  );

CREATE POLICY "Users can manage links for their own characters" ON public.character_world_info_link
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.characters 
      WHERE characters.id = character_world_info_link.character_id 
      AND characters.creator_id = auth.uid()
    )
  );

-- Create triggers for updated_at columns
CREATE TRIGGER handle_world_infos_updated_at
  BEFORE UPDATE ON public.world_infos
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_world_info_entries_updated_at
  BEFORE UPDATE ON public.world_info_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();