-- Create world_info_tags table for many-to-many relationship
CREATE TABLE public.world_info_tags (
  world_info_id UUID NOT NULL REFERENCES public.world_infos(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  UNIQUE(world_info_id, tag_id)
);

-- Enable Row Level Security on world_info_tags
ALTER TABLE public.world_info_tags ENABLE ROW LEVEL SECURITY;

-- RLS policies for world_info_tags (mirrors character_tags policies)
CREATE POLICY "World info tags are public" ON public.world_info_tags
  FOR SELECT USING (true);

CREATE POLICY "Owners can delete their world info tags" ON public.world_info_tags
  FOR DELETE USING (
    (SELECT world_infos.creator_id FROM public.world_infos 
     WHERE world_infos.id = world_info_tags.world_info_id) = auth.uid()
  );

CREATE POLICY "Owners can manage their world info tags" ON public.world_info_tags
  FOR INSERT WITH CHECK (
    (SELECT world_infos.creator_id FROM public.world_infos 
     WHERE world_infos.id = world_info_tags.world_info_id) = auth.uid()
  );