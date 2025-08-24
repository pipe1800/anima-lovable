import { supabase } from '@/db/client';
import { Tags } from '@/data';

export const getRecommendedCharacters = async (tags: string[], limit = 4) => {
  try {
    let tagIds: number[] | null = null;
    if (tags.length) {
      const { data: resolved, error } = await Tags.resolveTagNamesRPC(tags);
      if (!error && resolved.length) {
        tagIds = resolved.map(r => r.id);
      } else {
        const { data: fallback } = await Tags.resolveTagIds(tags);
        if (fallback.length) tagIds = fallback;
      }
    }
    const { data, error } = await (supabase as any).rpc('get_public_character_cards', {
      p_search: null,
      p_sort: 'popular',
      p_tag_ids: tagIds && tagIds.length ? tagIds : null,
      p_creator_username: null,
      p_include_nsfw: true,
      p_limit: limit,
      p_offset: 0
    });
    if (error) throw error;
    let rows = (data as any[]) || [];
    // If insufficient results with tag filter, fallback to popular (no tags) to fill
    if (rows.length < limit) {
      const remaining = limit - rows.length;
      const { data: fallback } = await (supabase as any).rpc('get_public_character_cards', {
        p_search: null,
        p_sort: 'popular',
        p_tag_ids: null,
        p_creator_username: null,
        p_include_nsfw: true,
        p_limit: limit,
        p_offset: 0
      });
      const existing = new Set(rows.map(r => r.id));
      (fallback as any[] | null)?.forEach(r => { if (rows.length < limit && !existing.has(r.id)) rows.push(r); });
    }
    return { data: rows.slice(0, limit), error: null };
  } catch (error) {
    return { data: [], error };
  }
};
