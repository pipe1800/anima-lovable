-- Fix world_info_likes table name mismatch
-- The schema shows world_info_user_likes but code expects world_info_likes

-- Drop world_info_likes table if it exists (from older migration)
DROP TABLE IF EXISTS public.world_info_likes CASCADE;

-- Create the world_info_likes table to match what the frontend expects
CREATE TABLE public.world_info_likes (
  user_id uuid NOT NULL,
  world_info_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT world_info_likes_pkey PRIMARY KEY (user_id, world_info_id),
  CONSTRAINT world_info_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT world_info_likes_world_info_id_fkey FOREIGN KEY (world_info_id) REFERENCES public.world_infos(id)
);

-- Enable RLS
ALTER TABLE public.world_info_likes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view all world info likes" ON public.world_info_likes
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own world info likes" ON public.world_info_likes
  FOR ALL USING (auth.uid() = user_id);

-- Migrate data from world_info_user_likes if it exists
INSERT INTO public.world_info_likes (user_id, world_info_id, created_at)
SELECT user_id, world_info_id, created_at 
FROM public.world_info_user_likes
ON CONFLICT (user_id, world_info_id) DO NOTHING;
