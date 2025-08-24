import { supabase } from '@/db/client';

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
  if (error) return { data: [], total: 0, error };
  const items = (data as any)?.items || [];
  return { data: items, total: (data as any)?.total || 0, hasMore: offset + limit < ((data as any)?.total || 0) };
};

export const listUserWorldInfos = async (userId: string) => {
  const { data, error } = await supabase.rpc('list_user_world_infos', { p_user_id: userId });
  if (error) return { data: [], error };
  return { data: (data as any[]) || [], error: null };
};
