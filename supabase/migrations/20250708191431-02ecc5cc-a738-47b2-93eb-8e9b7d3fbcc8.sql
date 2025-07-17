-- Create world_info_users table to track which users use specific world infos
CREATE TABLE public.world_info_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  world_info_id UUID NOT NULL REFERENCES public.world_infos(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure each user can only "use" a world info once
  UNIQUE(user_id, world_info_id)
);

-- Enable Row Level Security
ALTER TABLE public.world_info_users ENABLE ROW LEVEL SECURITY;

-- Users can insert their own records (add world infos to their collection)
CREATE POLICY "Users can add world infos to their collection"
ON public.world_info_users
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own records (remove world infos from their collection)
CREATE POLICY "Users can remove world infos from their collection"
ON public.world_info_users
FOR DELETE
USING (auth.uid() = user_id);

-- Users can only view their own world info usage records
CREATE POLICY "Users can view their own world info usage"
ON public.world_info_users
FOR SELECT
USING (auth.uid() = user_id);

-- Create index for better performance on user queries
CREATE INDEX idx_world_info_users_user_id ON public.world_info_users(user_id);
CREATE INDEX idx_world_info_users_world_info_id ON public.world_info_users(world_info_id);