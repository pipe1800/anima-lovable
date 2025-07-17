-- Remove avatar_url column from world_infos table
ALTER TABLE public.world_infos DROP COLUMN IF EXISTS avatar_url;