-- Update character_profile_view to embed creator username & avatar to avoid extra profile fetch
DROP VIEW IF EXISTS public.character_profile_view CASCADE;

CREATE VIEW public.character_profile_view AS
SELECT
  c.id,
  c.name,
  c.short_description,
  c.avatar_url,
  c.visibility,
  c.creator_id,
  p.username          AS creator_username,
  p.avatar_url        AS creator_avatar_url,
  c.interaction_count,
  c.created_at,
  c.updated_at,
  cd.greeting,
  cd.personality_summary,
  COALESCE(ch.chat_count, 0)      AS chats_count,
  COALESCE(l.like_count, 0)       AS likes_count,
  COALESCE(f.favorite_count, 0)   AS favorites_count,
  COALESCE(t.tags, '[]'::json)    AS tags,
  COALESCE(t.tag_names, ARRAY[]::text[]) AS tag_names,
  (t.nsfw_count > 0)              AS is_nsfw
FROM characters c
LEFT JOIN profiles p ON p.id = c.creator_id
LEFT JOIN character_definitions cd ON cd.character_id = c.id
LEFT JOIN (
  SELECT character_id, COUNT(*) chat_count
  FROM chats
  GROUP BY character_id
) ch ON ch.character_id = c.id
LEFT JOIN (
  SELECT character_id, COUNT(*) like_count
  FROM character_likes
  GROUP BY character_id
) l ON l.character_id = c.id
LEFT JOIN (
  SELECT character_id, COUNT(*) favorite_count
  FROM character_favorites
  GROUP BY character_id
) f ON f.character_id = c.id
LEFT JOIN (
  SELECT
    ct.character_id,
    json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name) AS tags,
    array_agg(t.name)                                                       AS tag_names,
    COUNT(*) FILTER (WHERE t.id = 24)                                       AS nsfw_count
  FROM character_tags ct
  JOIN tags t ON t.id = ct.tag_id
  GROUP BY ct.character_id
) t ON t.character_id = c.id;

-- Supporting indexes (base tables)
CREATE INDEX IF NOT EXISTS idx_characters_visibility_created_at ON characters (visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_characters_visibility_interaction ON characters (visibility, interaction_count DESC);
CREATE INDEX IF NOT EXISTS idx_characters_lower_name ON characters (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_character_tags_character_id ON character_tags (character_id);
CREATE INDEX IF NOT EXISTS idx_character_tags_tag_id_character_id ON character_tags (tag_id, character_id);

GRANT SELECT ON public.character_profile_view TO authenticated;
