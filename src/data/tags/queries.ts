import { supabase } from '@/db/client';
import type { Tables } from '@/integrations/supabase/types';

export type Tag = Tables<'tags'>;

// Simple in-memory cache (reset on reload)
let _allTagsCache: { data: Tag[]; fetchedAt: number } | null = null;
const TAG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchAllTagsCached(force = false): Promise<{ data: Tag[]; error: any }> {
  if (
    force ||
    !_allTagsCache ||
    Date.now() - _allTagsCache.fetchedAt > TAG_CACHE_TTL_MS
  ) {
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .order('name');
    if (error) return { data: [], error };
    _allTagsCache = { data: (data as Tag[]) || [], fetchedAt: Date.now() };
  }
  return { data: _allTagsCache.data, error: null };
}

// Unified list function (replaces getAllTags / getTagNames internally)
export const listTags = async (opts?: {
  namesOnly?: boolean;
  forceRefresh?: boolean;
}): Promise<{ data: Tag[] | string[]; error: any }> => {
  const { namesOnly = false, forceRefresh = false } = opts || {};
  const { data, error } = await fetchAllTagsCached(forceRefresh);
  if (error) return { data: [], error };
  if (namesOnly) return { data: data.map(t => t.name), error: null };
  return { data, error: null };
};

// Backwards compatible wrappers
export const getAllTags = async () => listTags({ namesOnly: false });
export const getTagNames = async () => listTags({ namesOnly: true });

// Generic single tag fetcher using cache first
export const getTagByName = async (
  name: string,
  opts?: { caseInsensitive?: boolean }
): Promise<{ data: Tag | null; error: any }> => {
  const { caseInsensitive = true } = opts || {};
  const { data, error } = await fetchAllTagsCached();
  if (error) return { data: null, error };
  const target = caseInsensitive
    ? data.find(t => t.name.toLowerCase() === name.toLowerCase())
    : data.find(t => t.name === name);
  return { data: target || null, error: null };
};

// Case-insensitive wrapper retained for compatibility
export const getTagByNameInsensitive = async (name: string) => getTagByName(name, { caseInsensitive: true });

// NSFW tag helper now derived from cached list (no separate round trip)
export const getNSFWTag = async () => getTagByName('nsfw', { caseInsensitive: true });

// Bulk resolution (case-insensitive) using cache to avoid multiple round trips
export const getTagsByNames = async (
  names: string[]
): Promise<{ data: Tag[]; error: any }> => {
  if (!names?.length) return { data: [], error: null };
  const wanted = new Set(names.map(n => n.toLowerCase()));
  const { data, error } = await fetchAllTagsCached();
  if (error) return { data: [], error };
  const rows = data.filter(t => wanted.has(t.name.toLowerCase()));
  return { data: rows, error: null };
};

// Utility to return only IDs for given names (common pattern elsewhere)
export const resolveTagIds = async (names: string[]): Promise<{ data: number[]; error: any }> => {
  const { data, error } = await getTagsByNames(names);
  if (error) return { data: [], error };
  return { data: data.map(t => t.id), error: null };
};

export const resolveTagNamesRPC = async (names: string[]): Promise<{ data: Array<Pick<Tag,'id'|'name'>>; error: any }> => {
  if (!names?.length) return { data: [], error: null };
  const { data, error } = await (supabase as any).rpc('resolve_tag_names', { p_names: names });
  if (error) return { data: [], error };
  return { data: (data as any[])?.map(r => ({ id: r.id, name: r.name })) || [], error: null };
};

export const invalidateTagCache = () => { _allTagsCache = null; };
