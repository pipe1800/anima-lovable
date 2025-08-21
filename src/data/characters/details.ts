import { supabase } from '@/db/client';

export const getCharacterDetails = async (characterId: string) => {
  const { data, error } = await supabase
    .from('characters')
    .select(`
      id,
      name,
      short_description,
      tagline,
      avatar_url,
      visibility,
      interaction_count,
      created_at,
      creator_id,
      character_definitions ( greeting, description, personality_summary, scenario, initial_addon_context_enabled, initial_addon_context ),
      character_tags ( tag:tags ( id, name ) )
    `)
    .eq('id', characterId)
    .maybeSingle();
  if (error || !data) return { data: null, error };
  let creatorProfile: any = null;
  try {
    const { data: profileData } = await supabase
      .from('public_profiles')
      .select('id, username, avatar_url')
      .eq('id', data.creator_id)
      .maybeSingle();
    creatorProfile = profileData || null;
  } catch {}
  const definitionNode = Array.isArray(data.character_definitions)
    ? data.character_definitions[0]
    : data.character_definitions;
  const tags = (data.character_tags || [])
    .map((ct: any) => ct?.tag)
    .filter(Boolean);
  const characterWithDetails = {
    id: data.id,
    name: data.name,
    short_description: data.short_description,
    tagline: data.tagline,
    creator: creatorProfile,
    avatar_url: data.avatar_url,
    visibility: data.visibility,
    interaction_count: data.interaction_count,
    created_at: data.created_at,
    creator_id: data.creator_id,
    character_definitions: definitionNode || null,
    definition: definitionNode ? [definitionNode] : [],
    tags,
  } as any;
  return { data: characterWithDetails, error: null };
};

export const getCharacterWasPublic = async (characterId: string): Promise<boolean> => {
  try {
    const { data } = await (supabase as any)
      .from('characters')
      .select('was_public')
      .eq('id', characterId)
      .maybeSingle();
    return !!data?.was_public;
  } catch {
    return false;
  }
};
