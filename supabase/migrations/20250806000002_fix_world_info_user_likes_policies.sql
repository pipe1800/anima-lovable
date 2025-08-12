-- Fix RLS policies for world_info_user_likes table
-- The policies were created for world_info_likes but the actual table is world_info_user_likes

-- Enable RLS on world_info_user_likes
ALTER TABLE public.world_info_user_likes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for world_info_user_likes (mirrors character_likes)
CREATE POLICY "Users can view all world info user likes" ON public.world_info_user_likes
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own world info user likes" ON public.world_info_user_likes
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
