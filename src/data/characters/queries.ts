import { supabase } from '@/db/client';
import { SearchParams, SearchResult } from '../shared/searchTypes';
import { Tags } from '@/data';

export const getPublicCharacters = async (limit = 20, offset = 0, nsfwEnabled = true) => {
  try {
    const { data, error } = await (supabase as any)
      .rpc('get_public_character_cards', {
        p_search: null,
        p_sort: 'popular',
        p_tag_ids: null,
        p_creator_username: null,
        p_include_nsfw: nsfwEnabled,
        p_limit: limit,
        p_offset: offset
      });
    if (error || !data) return { data: [], error };
    const normalized = (data as any[]).map(row => ({
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
      creator: row.creator || null,
      tags: Array.isArray(row.tags) ? row.tags : []
    }));
    return { data: normalized, error: null };
  } catch (e: any) {
    return { data: [], error: e };
  }
};

export const searchPublicCharacters = async (params: SearchParams): Promise<SearchResult<any>> => {
  const { searchQuery, sortBy, filters, limit, offset } = params;
  try {
    let tagIds: number[] | null = null;
    if (filters.tags && filters.tags.length) {
      // Use RPC first (fast bulk), fallback to cached resolver if needed
      const { data: resolved, error: rErr } = await Tags.resolveTagNamesRPC(filters.tags as string[]);
      if (!rErr && resolved.length) {
        tagIds = resolved.map(r => r.id);
      } else {
        const { data: cached } = await Tags.resolveTagIds(filters.tags as string[]);
        if (cached.length) tagIds = cached;
      }
    }
    const sanitized = searchQuery ? sanitizeSearchInput(searchQuery) : null;
    const { data, error } = await (supabase as any).rpc('get_public_character_cards', {
      p_search: sanitized || null,
      p_sort: sortBy || 'popular',
      p_tag_ids: tagIds && tagIds.length ? tagIds : null,
      p_creator_username: filters.creator ? filters.creator.trim() || null : null,
      p_include_nsfw: filters.nsfw !== false,
      p_limit: limit,
      p_offset: offset
    });
    if (error || !data) return { data: [], total: 0, hasMore: false, error };
    const rows = data as any[];
    const total = rows.length ? Number(rows[0].total_count) : 0;
    const normalized = rows.map(row => ({
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
      creator: row.creator || null,
      tags: Array.isArray(row.tags) ? row.tags : []
    }));
    const hasMore = offset + limit < total;
    return { data: normalized, total, hasMore };
  } catch (e: any) {
    return { data: [], total: 0, hasMore: false, error: e };
  }
};

// Deprecated: use Tags.getTagsByNames / Tags.resolveTagNamesRPC
export const getTagsByNames = async (names: string[]) => Tags.getTagsByNames(names);

export const getRelatedCharacters = async (currentCharacterId: string, tagIds: number[]) => {
  const { data, error } = await (supabase as any)
    .rpc('related_characters', { current_character_id: currentCharacterId, tag_ids: tagIds || [] });
  return { data, error };
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
