import type { PostgrestSingleResponse } from '@supabase/supabase-js';

import { supabase } from '@/db/client';
import { callRpc } from '@/db/rpc';
import type { Json } from '@/integrations/supabase/types';
import { resolveTagIds, resolveTagNamesRPC } from '@/data/tags/queries';

import type { PublicCharacterCard } from './queries';

interface PublicCharacterCardRow {
  id: string;
  name: string;
  short_description: string | null;
  avatar_url: string | null;
  interaction_count: number | null;
  created_at: string;
  creator_id: string;
  likes_count: number | null;
  favorites_count: number | null;
  chats_count: number | null;
  creator: Json | null;
  tags: Json[] | null;
}

const mapPublicCharacter = (row: PublicCharacterCardRow): PublicCharacterCard => ({
  id: row.id,
  name: row.name,
  short_description: row.short_description ?? undefined,
  avatar_url: row.avatar_url ?? undefined,
  interaction_count: row.interaction_count ?? 0,
  created_at: row.created_at,
  creator_id: row.creator_id,
  likes_count: row.likes_count ?? 0,
  favorites_count: row.favorites_count ?? 0,
  chats_count: row.chats_count ?? 0,
  creator: row.creator ?? null,
  tags: Array.isArray(row.tags) ? row.tags : [],
});

const fetchRecommendedRows = async (
  tagIds: number[] | null,
  limit: number,
): Promise<PostgrestSingleResponse<PublicCharacterCardRow[]>> =>
  callRpc<PublicCharacterCardRow[]>(supabase, 'get_public_character_cards', {
    p_search: null,
    p_sort: 'popular',
    p_tag_ids: tagIds && tagIds.length ? tagIds : null,
    p_creator_username: null,
    p_include_nsfw: true,
    p_limit: limit,
    p_offset: 0,
  });

export const getRecommendedCharacters = async (
  tags: string[],
  limit = 4,
): Promise<{ data: PublicCharacterCard[]; error: unknown }> => {
  try {
    let tagIds: number[] | null = null;
    if (tags.length) {
      const { data: resolved, error } = await resolveTagNamesRPC(tags);
      if (!error && resolved.length) {
        tagIds = resolved.map((entry) => entry.id);
      } else {
        const { data: fallback } = await resolveTagIds(tags);
        if (fallback.length) tagIds = fallback;
      }
    }

    const primary = await fetchRecommendedRows(tagIds, limit);
    if (primary.error) throw primary.error;

    let rows = primary.data ?? [];

    if (rows.length < limit) {
      const fallback = await fetchRecommendedRows(null, limit);
      if (!fallback.error && fallback.data) {
        const existingIds = new Set(rows.map((row) => row.id));
        for (const candidate of fallback.data) {
          if (rows.length >= limit) break;
          if (!existingIds.has(candidate.id)) {
            rows = [...rows, candidate];
            existingIds.add(candidate.id);
          }
        }
      }
    }

    return { data: rows.slice(0, limit).map(mapPublicCharacter), error: null };
  } catch (error: unknown) {
    return { data: [], error };
  }
};
