-- Migration: Adjust tag-related RLS policies per requirement
-- Date: 2025-08-19
-- NOTE: Allow unauthenticated users to view tags AND assign (insert/delete) tag relations
-- for characters and world infos, without permitting creation / modification of tag definitions.
-- Security Consideration: Allowing anonymous inserts can be abused for spam. Consider
-- adding a Postgres rate limiting extension or server-side validation later.

-- Character Tags: broaden insert/delete to public (no auth) but keep update disabled
DROP POLICY IF EXISTS "Users can manage tags for their own characters" ON public.character_tags;
DROP POLICY IF EXISTS "Character tags are publicly viewable" ON public.character_tags;

CREATE POLICY "Character tags are publicly viewable" ON public.character_tags
  FOR SELECT USING (true);

-- Allow anyone to INSERT a relation if referenced character & tag exist.
CREATE POLICY "Anyone can assign tag to character" ON public.character_tags
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.characters c WHERE c.id = character_tags.character_id)
    AND EXISTS (SELECT 1 FROM public.tags t WHERE t.id = character_tags.tag_id)
  );

-- Allow anyone to remove a tag relation (since they could re-add); OPTIONAL: restrict to character owner
CREATE POLICY "Anyone can remove tag from character" ON public.character_tags
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.characters c WHERE c.id = character_tags.character_id)
  );

-- World Info Tags adjustments
DROP POLICY IF EXISTS "Owners can manage their world info tags" ON public.world_info_tags;
DROP POLICY IF EXISTS "Owners can delete their world info tags" ON public.world_info_tags;
DROP POLICY IF EXISTS "World info tags are public" ON public.world_info_tags;

CREATE POLICY "World info tags are public" ON public.world_info_tags
  FOR SELECT USING (true);

CREATE POLICY "Anyone can assign tag to world info" ON public.world_info_tags
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.world_infos w WHERE w.id = world_info_tags.world_info_id)
    AND EXISTS (SELECT 1 FROM public.tags t WHERE t.id = world_info_tags.tag_id)
  );

CREATE POLICY "Anyone can remove tag from world info" ON public.world_info_tags
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.world_infos w WHERE w.id = world_info_tags.world_info_id)
  );

-- Ensure tags remain read-only except select
DROP POLICY IF EXISTS "Tags are publicly readable" ON public.tags;
CREATE POLICY "Tags are publicly readable" ON public.tags FOR SELECT USING (true);
-- (No INSERT/UPDATE/DELETE policies => only service role can modify)
