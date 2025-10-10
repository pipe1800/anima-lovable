import { supabase } from '@/db/client';
import type { WorldInfoSummaryItem } from '@/types/world-info';

export interface WorldInfoFullResult {
  id: string; name: string; short_description: string | null; visibility: string;
  creator_id: string; likes_count: number; interaction_count: number;
  created_at: string; updated_at: string; creator: { username: string; avatar_url: string | null } | null;
  entries: Array<{ id: string; keywords: string[]; entry_text: string; created_at: string }>; tags: Array<{ id: number; name: string }>;
  is_liked: boolean; is_used: boolean;
}

export const fetchWorldInfoFull = async (id: string) => {
  const { data, error } = await supabase.rpc('fetch_world_info_full', { p_world_info_id: id });
  if (error) return { data: null, error };
  return { data: data as WorldInfoFullResult | null, error: null };
};

export interface ListPublicWorldInfosParams {
  search?: string; sort?: 'newest' | 'interactions'; offset?: number; limit?: number; excludeNSFW?: boolean; tagIds?: number[];
}

export const listPublicWorldInfos = async (p: ListPublicWorldInfosParams = {}) => {
  const { search, sort = 'interactions', offset = 0, limit = 20, excludeNSFW = false, tagIds } = p;
  const { data, error } = await supabase.rpc('list_public_world_infos', {
    p_search: search ?? null,
    p_sort: sort,
    p_offset: offset,
    p_limit: limit,
    p_exclude_nsfw: excludeNSFW,
    p_tag_ids: tagIds && tagIds.length ? tagIds : null
  });
  if (error) return { data: [] as WorldInfoSummaryItem[], total: 0, hasMore: false, error };

  const payload = data as { items?: unknown; total?: unknown } | null;
  const itemsRaw = Array.isArray(payload?.items) ? payload?.items : [];
  const items = (itemsRaw as WorldInfoSummaryItem[]) ?? [];
  const total = typeof payload?.total === 'number' ? payload.total : 0;
  return {
    data: items,
    total,
    hasMore: offset + limit < (total ?? 0),
    error: null,
  };
};

export const listUserWorldInfos = async (userId: string) => {
  const { data, error } = await supabase.rpc('list_user_world_infos', { p_user_id: userId });
  if (error) return { data: [] as WorldInfoSummaryItem[], error };
  return { data: (Array.isArray(data) ? (data as WorldInfoSummaryItem[]) : []), error: null };
};
