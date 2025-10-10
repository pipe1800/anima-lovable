import type { PostgrestSingleResponse } from '@supabase/supabase-js';

import { supabase } from '@/db/client';
import type { Json } from '@/integrations/supabase/types';

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
    scenario?: Json;
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

interface CharacterDefinitionRow {
  greeting: string | null;
  description: string | null;
  personality_summary: string | null;
  scenario: Json | null;
  model_id: string | null;
}

interface ProfileCreatorRow {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface CharacterTagRow {
  id: number | string;
  name: string;
}

interface CharacterWorldInfoRow {
  id: string | number;
  name: string;
  short_description: string | null;
}

interface CharacterProfileViewRow {
  id: string;
  name: string;
  tagline: string | null;
  short_description: string | null;
  avatar_url: string | null;
  visibility: 'public' | 'unlisted' | 'private';
  interaction_count: number;
  created_at: string;
  updated_at: string | null;
  creator_id: string;
  was_public: boolean | null;
  character_definitions: CharacterDefinitionRow | null;
  creator: ProfileCreatorRow | null;
  tags: CharacterTagRow[] | null;
  world_infos: CharacterWorldInfoRow[] | null;
  chats_count: number | null;
  messages_count: number | null;
  favorites_count: number | null;
  likes_count: number | null;
}

interface CharacterSummaryRow {
  id: string;
  name: string;
  avatar_url: string | null;
  visibility: 'public' | 'unlisted' | 'private';
  likes_count: number | null;
  chats_count: number | null;
  tagline: string | null;
  short_description: string | null;
  creator_id: string;
}

interface CharacterGreetingSummaryRow {
  id: string;
  name: string;
  avatar_url: string | null;
  visibility: 'public' | 'unlisted' | 'private';
  creator_id: string;
  character_definitions: {
    greeting: string | null;
    personality_summary: string | null;
  } | null;
}

function normalizeViewRow(viewData: CharacterProfileViewRow): CharacterFullData {
  const creatorId = viewData.creator_id;
  const rawDefs = viewData.character_definitions;
  const character_definitions: CharacterFullData['character_definitions'] = {
    personality_summary: rawDefs?.personality_summary ?? '',
    description: rawDefs?.description ?? undefined,
    greeting: rawDefs?.greeting ?? undefined,
    scenario: rawDefs?.scenario ?? undefined,
    model_id: rawDefs?.model_id ?? undefined,
  };
  const rawCreator = viewData.creator;
  const creator: CharacterFullData['creator'] = {
    id: rawCreator?.id ?? creatorId,
    username: rawCreator?.username ?? 'Unknown',
    avatar_url: rawCreator?.avatar_url ?? null,
  };
  const tags: CharacterFullData['tags'] = (viewData.tags ?? [])
    .map((tag) => ({ id: Number(tag.id), name: String(tag.name) }))
    .filter((tag) => !Number.isNaN(tag.id));
  const world_infos: CharacterFullData['world_infos'] = (viewData.world_infos ?? [])
    .map((info) => ({
      id: String(info.id),
      name: String(info.name),
      short_description: info.short_description ?? undefined,
    }));
  const stats = {
    total_chats: viewData.chats_count ?? 0,
    total_messages: viewData.messages_count ?? 0,
    unique_users: 0,
    average_rating: null,
    total_favorites: viewData.favorites_count ?? 0,
    total_likes: viewData.likes_count ?? 0,
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
  const response = await supabase
    .from('character_profile_view')
    .select('*')
    .eq('id', characterId)
    .single();
  const { data: viewData, error } = response as PostgrestSingleResponse<CharacterProfileViewRow>;
  if (error || !viewData) throw error || new Error('Character not found');
  return normalizeViewRow(viewData);
}

/** Fetch a public character profile only (public visibility enforced) */
export async function getPublicCharacterProfile(characterId: string): Promise<CharacterFullData> {
  const response = await supabase
    .from('character_profile_view')
    .select('*')
    .eq('id', characterId)
    .eq('visibility', 'public')
    .single();
  const { data: viewData, error } = response as PostgrestSingleResponse<CharacterProfileViewRow>;
  if (error || !viewData) throw error || new Error('Character not found or not public');
  return normalizeViewRow(viewData);
}

// Lightweight public summary (Phase 7/9) – avoids full view for simple displays
export async function getPublicCharacterSummary(characterId: string) {
  const response = await supabase
    .from('characters')
    .select('id, name, avatar_url, visibility, likes_count, chats_count, tagline, short_description, creator_id')
    .eq('id', characterId)
    .eq('visibility', 'public')
    .maybeSingle();
  const { data, error } = response as PostgrestSingleResponse<CharacterSummaryRow>;
  if (error || !data) return { data: null, error: error || new Error('Not found') };
  return { data, error: null };
}

// Minimal payload to power pre-chat greeting picker
export async function getCharacterGreetingSummary(characterId: string) {
  const response = await supabase
    .from('characters')
    .select(`
      id,
      name,
      avatar_url,
      visibility,
      creator_id,
      character_definitions ( greeting, personality_summary )
    `)
    .eq('id', characterId)
    .maybeSingle();
  const { data, error } = response as PostgrestSingleResponse<CharacterGreetingSummaryRow>;
  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error('Character not found') };
  return { data, error: null };
}
