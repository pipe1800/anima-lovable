-- RLS policies for character_tags table
CREATE POLICY "Character tags are publicly viewable" 
ON character_tags 
FOR SELECT 
USING (true);

CREATE POLICY "Users can manage tags for their own characters" 
ON character_tags 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM characters 
    WHERE characters.id = character_tags.character_id 
    AND characters.creator_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM characters 
    WHERE characters.id = character_tags.character_id 
    AND characters.creator_id = auth.uid()
  )
);

-- RLS policies for tags table (already exists but ensuring it's comprehensive)
CREATE POLICY "Tags are publicly readable" 
ON tags 
FOR SELECT 
USING (true);

-- RLS policies for world_info_tags table
CREATE POLICY "World info tags are publicly viewable" 
ON world_info_tags 
FOR SELECT 
USING (true);

CREATE POLICY "Users can manage tags for their own world infos" 
ON world_info_tags 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM world_infos 
    WHERE world_infos.id = world_info_tags.world_info_id 
    AND world_infos.creator_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM world_infos 
    WHERE world_infos.id = world_info_tags.world_info_id 
    AND world_infos.creator_id = auth.uid()
  )
);