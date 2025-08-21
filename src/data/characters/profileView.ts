import { supabase } from '@/db/client';

export interface CharacterFullData {
  id: string;
  name: string;
  tagline?: string;
  short_description?: string;
  avatar_url?: string;
  visibility: 'public' | 'unlisted' | 'private';
  interaction_count: number;
  created_at: string;
  updated_at: string;
  creator_id: string;
  was_public?: boolean;
  character_definitions: {
    greeting?: string;
    description?: string;
    personality_summary: string;
    scenario?: any;
    model_id?: string;
  };
  creator: {
    id: string;
    username: string;
    avatar_url?: string | null;
  };
  tags: Array<{ id: number; name: string }>;
  world_infos?: Array<{ id: string; name: string; short_description?: string }>;
  stats: {
    total_chats: number;
    total_messages: number;
    unique_users: number;
    average_rating?: number | null;
    total_favorites: number;
    total_likes: number;
  };
}

function normalizeViewRow(viewData: any): CharacterFullData {
  const creatorId = viewData.creator_id;
  const rawDefs = viewData.character_definitions;
  const character_definitions: CharacterFullData['character_definitions'] = {
    personality_summary: (rawDefs && typeof rawDefs === 'object' && !Array.isArray(rawDefs) && rawDefs.personality_summary) || '',
    description: (rawDefs && typeof rawDefs === 'object' && !Array.isArray(rawDefs) && rawDefs.description) ?? undefined,
    greeting: (rawDefs && typeof rawDefs === 'object' && !Array.isArray(rawDefs) && rawDefs.greeting) ?? undefined,
    scenario: (rawDefs && typeof rawDefs === 'object' && !Array.isArray(rawDefs) && rawDefs.scenario) ?? undefined,
    model_id: (rawDefs && typeof rawDefs === 'object' && !Array.isArray(rawDefs) && rawDefs.model_id) ?? undefined,
  };
  const rawCreator = viewData.creator;
  const creator: CharacterFullData['creator'] = {
    id: (rawCreator && typeof rawCreator === 'object' && !Array.isArray(rawCreator) && rawCreator.id) || creatorId,
    username: (rawCreator && typeof rawCreator === 'object' && !Array.isArray(rawCreator) && rawCreator.username) || 'Unknown',
    avatar_url: (rawCreator && typeof rawCreator === 'object' && !Array.isArray(rawCreator) && rawCreator.avatar_url) ?? null,
  };
  const rawTags = viewData.tags;
  const tags: CharacterFullData['tags'] = Array.isArray(rawTags)
    ? rawTags
        .map((t: any) => (t && typeof t === 'object' ? { id: Number(t.id), name: String(t.name) } : null))
        .filter(Boolean) as { id: number; name: string }[]
    : [];
  const rawWorldInfos = viewData.world_infos;
  const world_infos: CharacterFullData['world_infos'] = Array.isArray(rawWorldInfos)
    ? rawWorldInfos
        .map((w: any) => (w && typeof w === 'object' ? { id: String(w.id), name: String(w.name), short_description: (w.short_description as string) ?? undefined } : null))
        .filter(Boolean) as { id: string; name: string; short_description?: string }[]
    : [];
  const stats = {
    total_chats: viewData.chats_count || 0,
    total_messages: viewData.messages_count || 0,
    unique_users: 0,
    average_rating: null,
    total_favorites: viewData.favorites_count || 0,
    total_likes: viewData.likes_count || 0,
  };
  return {
    id: viewData.id,
    name: viewData.name,
    tagline: viewData.tagline ?? undefined,
    short_description: viewData.short_description ?? undefined,
    avatar_url: viewData.avatar_url ?? undefined,
    visibility: viewData.visibility || 'public',
    was_public: viewData.was_public ?? false,
    interaction_count: viewData.interaction_count,
    created_at: viewData.created_at,
    updated_at: viewData.updated_at ?? viewData.created_at,
    creator_id: creatorId,
    character_definitions,
    creator,
    tags,
    world_infos,
    stats,
  };
}

/** Fetch full profile for any visibility (caller must enforce permissions) */
export async function getCharacterFullProfile(characterId: string): Promise<CharacterFullData> {
  const { data: viewData, error } = await (supabase as any)
    .from('character_profile_view')
    .select('*')
    .eq('id', characterId)
    .single();
  if (error || !viewData) throw error || new Error('Character not found');
  return normalizeViewRow(viewData);
}

/** Fetch a public character profile only (public visibility enforced) */
export async function getPublicCharacterProfile(characterId: string): Promise<CharacterFullData> {
  const { data: viewData, error } = await (supabase as any)
    .from('character_profile_view')
    .select('*')
    .eq('id', characterId)
    .eq('visibility', 'public')
    .single();
  if (error || !viewData) throw error || new Error('Character not found or not public');
  return normalizeViewRow(viewData);
}
