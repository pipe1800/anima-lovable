-- Create character_likes table
CREATE TABLE public.character_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(character_id, user_id)
);

-- Create character_favorites table
CREATE TABLE public.character_favorites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(character_id, user_id)
);

-- Enable RLS on both tables
ALTER TABLE public.character_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_favorites ENABLE ROW LEVEL SECURITY;

-- RLS policies for character_likes
CREATE POLICY "Users can view all character likes" 
ON public.character_likes 
FOR SELECT 
USING (true);

CREATE POLICY "Users can manage their own likes" 
ON public.character_likes 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS policies for character_favorites  
CREATE POLICY "Users can view all character favorites" 
ON public.character_favorites 
FOR SELECT 
USING (true);

CREATE POLICY "Users can manage their own favorites" 
ON public.character_favorites 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);