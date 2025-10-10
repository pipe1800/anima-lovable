import { supabase } from '@/db/client';
import { callRpc } from '@/db/rpc';
import type { Json } from '@/integrations/supabase/types';
import type { SearchParams, SearchResult } from '../shared/searchTypes';
import {
  getTagsByNames as getTagsByNamesInternal,
  resolveTagIds,
  resolveTagNamesRPC,
} from '@/data/tags/queries';

export interface PublicCharacterCard {
  id: string;
  name: string;
  short_description: string | null;
  avatar_url: string | null;
  interaction_count: number;
  created_at: string;
  creator_id: string;
  likes_count: number;
  favorites_count: number;
  chats_count: number;
  creator: Json | null;
  tags: Json[];
}

interface PublicCharacterCardRow extends Omit<PublicCharacterCard, 'likes_count' | 'favorites_count' | 'chats_count' | 'creator' | 'tags'> {
  likes_count: number | null;
  favorites_count: number | null;
  chats_count: number | null;
  creator: Json | null;
  tags: Json | Json[] | null;
  total_count?: number | null;
}

interface CharactersQueryResult {
  data: PublicCharacterCard[];
  error: unknown;
}

const mapPublicCharacterRow = (row: PublicCharacterCardRow): PublicCharacterCard => ({
  id: row.id,
  name: row.name,
  short_description: row.short_description,
  avatar_url: row.avatar_url,
  interaction_count: row.interaction_count,
  created_at: row.created_at,
  creator_id: row.creator_id,
  likes_count: row.likes_count ?? 0,
  favorites_count: row.favorites_count ?? 0,
  chats_count: row.chats_count ?? 0,
  creator: row.creator ?? null,
  tags: Array.isArray(row.tags) ? row.tags : row.tags ? [row.tags] : [],
});

export const getPublicCharacters = async (limit = 20, offset = 0, nsfwEnabled = true): Promise<CharactersQueryResult> => {
  try {
    const { data, error } = await callRpc<PublicCharacterCardRow[]>(supabase, 'get_public_character_cards', {
      p_search: null,
      p_sort: 'popular',
      p_tag_ids: null,
      p_creator_username: null,
      p_include_nsfw: nsfwEnabled,
      p_limit: limit,
      p_offset: offset,
    });
    if (error || !data) return { data: [], error };
    return { data: data.map(mapPublicCharacterRow), error: null };
  } catch (error: unknown) {
    return { data: [], error };
  }
};

export const searchPublicCharacters = async (
  params: SearchParams,
): Promise<SearchResult<PublicCharacterCard>> => {
  const { searchQuery, sortBy, filters, limit, offset } = params;
  try {
    let tagIds: number[] | null = null;
    if (filters.tags && filters.tags.length) {
      const { data: resolved, error: resolveError } = await resolveTagNamesRPC(filters.tags);
      if (!resolveError && resolved.length) {
        tagIds = resolved.map((tag) => tag.id);
      } else {
        const { data: cached } = await resolveTagIds(filters.tags);
        if (cached.length) tagIds = cached;
      }
    }

    const sanitized = searchQuery ? sanitizeSearchInput(searchQuery) : null;
    const { data, error } = await callRpc<PublicCharacterCardRow[]>(supabase, 'get_public_character_cards', {
      p_search: sanitized || null,
      p_sort: sortBy || 'popular',
      p_tag_ids: tagIds && tagIds.length ? tagIds : null,
      p_creator_username: filters.creator ? filters.creator.trim() || null : null,
      p_include_nsfw: filters.nsfw !== false,
      p_limit: limit,
      p_offset: offset,
    });

    if (error || !data) return { data: [], total: 0, hasMore: false, error };

    const total = data.length ? Number(data[0].total_count ?? 0) : 0;
    const normalized = data.map(mapPublicCharacterRow);
    const hasMore = offset + limit < total;
    return { data: normalized, total, hasMore };
  } catch (error: unknown) {
    return { data: [], total: 0, hasMore: false, error };
  }
};

// Deprecated: use getTagsByNamesInternal / resolveTagNamesRPC from tags module
export const getTagsByNames = async (names: string[]) => getTagsByNamesInternal(names);

export const getRelatedCharacters = async (currentCharacterId: string, tagIds: number[]) => {
  const { data, error } = await callRpc<Json[]>(supabase, 'related_characters', {
    current_character_id: currentCharacterId,
    tag_ids: tagIds || [],
  });
  return { data: data ?? [], error };
};

function sanitizeSearchInput(raw: string, maxLen = 100): string {
  if (!raw) return '';
  return raw
    .replace(/[%,"'();]/g, ' ')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}
