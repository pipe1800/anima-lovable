-- Add performance indexes for dynamic world info functionality
CREATE INDEX IF NOT EXISTS idx_character_world_info_link_character_id 
ON character_world_info_link(character_id);

CREATE INDEX IF NOT EXISTS idx_world_info_entries_world_info_id 
ON world_info_entries(world_info_id);