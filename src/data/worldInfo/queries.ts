import { supabase } from '@/db/client';
import { SearchParams, SearchResult } from '../shared/searchTypes';

// CONSOLIDATION NOTE (2025-08-21): Logic from deprecated worldInfo/publicProfile.ts merged here.
// Use getPublicWorldInfoDetailsFull (or its alias getPublicWorldInfoDetails) for detailed public fetch.

export const getPublicWorldInfos = async (limit = 20, offset = 0) => {
  const { data, error } = await supabase
    .from('world_infos')
    .select(`
      id,
      name,
      short_description,
      interaction_count,
      likes_count,
      created_at,
      updated_at,
      creator_id
    `)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error || !data) return { data: [], error };
  const creatorIds = [...new Set(data.map(w => w.creator_id))];
  const { data: creators } = await supabase
    .from('public_profiles')
    .select('id, username, avatar_url')
    .in('id', creatorIds);
  const creatorsMap = new Map((creators || []).map(c => [c.id, c]));
  const { data: tagsRows } = await supabase
    .from('world_info_tags')
    .select('world_info_id, tag:tags(id,name)')
    .in('world_info_id', data.map(w => w.id));
  const tagMap = new Map<string, any[]>();
  (tagsRows || []).forEach(r => {
    if (!r.tag) return;
    const arr = tagMap.get(r.world_info_id) || [];
    arr.push(r.tag);
    tagMap.set(r.world_info_id, arr);
  });
  const enriched = data.map(w => ({
    ...w,
    creator: creatorsMap.get(w.creator_id) || null,
    tags: tagMap.get(w.id) || [],
    favorites_count: 0,
    usage_count: 0,
    likesCount: (w as any).likes_count ?? 0
  }));
  return { data: enriched, error: null };
};

export const searchPublicWorldInfos = async (params: SearchParams): Promise<SearchResult<any>> => {
  const { searchQuery, sortBy, filters, limit, offset } = params;
  let query = supabase
    .from('world_infos')
    .select(`
      id,
      name,
      short_description,
      interaction_count,
      likes_count,
      created_at,
      updated_at,
      creator_id
    `, { count: 'exact' })
    .eq('visibility', 'public');
  if (searchQuery && searchQuery.trim()) {
    const sanitized = sanitizeSearchInput(searchQuery);
    if (sanitized) query = query.or(`name.ilike.%${sanitized}%,short_description.ilike.%${sanitized}%`);
  }
  if (filters.creator && filters.creator.trim()) {
    const { data: creators } = await supabase
      .from('public_profiles')
      .select('id')
      .ilike('username', `%${filters.creator}%`);
    if (!creators?.length) return { data: [], total: 0, hasMore: false };
    query = query.in('creator_id', creators.map(c => c.id));
  }
  switch (sortBy) {
    case 'newest':
      query = query.order('created_at', { ascending: false });
      break;
    default:
      query = query.order('interaction_count', { ascending: false });
  }
  query = query.range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error || !data) return { data: [], total: 0, hasMore: false, error };
  let filtered = data;
  if (filters.nsfw === false) {
    const { data: nsfwWorlds } = await supabase
      .from('world_info_tags')
      .select('world_info_id')
      .eq('tag_id', 24);
    if (nsfwWorlds?.length) {
      const banned = new Set(nsfwWorlds.map(r => r.world_info_id));
      filtered = filtered.filter(w => !banned.has(w.id));
    }
  }
  if (filters.tags?.length) {
    const { data: wt } = await supabase
      .from('world_info_tags')
      .select('world_info_id, tag:tags(name)')
      .in('world_info_id', filtered.map(w => w.id));
    const allowed = new Set<string>();
    (wt || []).forEach(r => { if (r.tag && filters.tags!.includes(r.tag.name)) allowed.add(r.world_info_id); });
    filtered = filtered.filter(w => allowed.has(w.id));
  }
  const creatorIds = [...new Set(filtered.map(w => w.creator_id))];
  const { data: creators } = await supabase
    .from('public_profiles')
    .select('id, username, avatar_url')
    .in('id', creatorIds);
  const creatorsMap = new Map((creators || []).map(c => [c.id, c]));
  const { data: tagsRows } = await supabase
    .from('world_info_tags')
    .select('world_info_id, tag:tags(id,name)')
    .in('world_info_id', filtered.map(w => w.id));
  const tagMap = new Map<string, any[]>();
  (tagsRows || []).forEach(r => { if (r.tag) { const arr = tagMap.get(r.world_info_id) || []; arr.push(r.tag); tagMap.set(r.world_info_id, arr);} });
  const results = filtered.map(w => ({
    ...w,
    creator: creatorsMap.get(w.creator_id) || null,
    tags: tagMap.get(w.id) || [],
    favorites_count: 0,
    usage_count: 0,
    likesCount: (w as any).likes_count ?? 0
  }));
  return { data: results, total: count || 0, hasMore: offset + limit < (count || 0) };
};

// Removed duplicate generic tag getters (2025-08-21). Use Tags.getAllTags / Tags.getTagNames / Tags.getNSFWTag / Tags.getTagByNameInsensitive from '@/data/tags/queries'.

export const getUserOwnedWorldInfos = async (userId: string) => {
  const { data, error } = await supabase
    .from('world_infos')
    .select(`
      *,
      world_info_entries(id),
      world_info_tags(tags(id,name))
    `)
    .eq('creator_id', userId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error };
  const enriched = (data || []).map(w => ({
    ...w,
    entriesCount: (w as any).world_info_entries?.length || 0,
    likesCount: (w as any).likes_count || 0,
    tags: ((w as any).world_info_tags || []).map((wt: any) => wt.tags).filter(Boolean) || []
  }));
  return { data: enriched, error: null };
};

export const getUserWorldInfoCollection = async (userId: string) => {
  const api: any = supabase;
  const { data, error } = await api
    .from('world_info_users')
    .select(`
      world_infos(
        *,
        world_info_entries(id),
        world_info_tags(tags(id,name))
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error };
  const worldInfos = (data || []).map((r: any) => r.world_infos).filter(Boolean) as any[];
  if (!worldInfos.length) return { data: [], error: null };
  const creatorIds = [...new Set(worldInfos.map(w => w.creator_id))];
  const { data: creators } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', creatorIds);
  const creatorsMap = new Map((creators || []).map(c => [c.id, c]));
  const enriched = worldInfos.map(w => ({
    ...w,
    entriesCount: (w as any).world_info_entries?.length || 0,
    likesCount: (w as any).likes_count || 0,
    tags: ((w as any).world_info_tags || []).map((wt: any) => wt.tags).filter(Boolean) || [],
    creator: creatorsMap.get(w.creator_id)
  }));
  return { data: enriched, error: null };
};

export const getWorldInfoWithEntries = async (worldInfoId: string) => {
  const { data, error } = await supabase
    .from('world_infos')
    .select(`
      *,
      world_info_entries(*),
      world_info_tags(tags(id,name))
    `)
    .eq('id', worldInfoId)
    .single();
  if (error || !data) return { data: null, error: error || new Error('Not found') };
  return { data: {
    ...data,
    entries: (data as any).world_info_entries || [],
    tags: ((data as any).world_info_tags || []).map((wt: any) => wt.tags).filter(Boolean)
  }, error: null };
};

export const getWorldInfoTags = async (worldInfoId: string) => {
  const api: any = supabase;
  const { data, error } = await api
    .from('world_info_tags')
    .select('tags(id,name)')
    .eq('world_info_id', worldInfoId);
  if (error) return { data: [], error };
  return { data: (data || []).map((wt: any) => wt.tags).filter(Boolean), error: null };
};

export const getWorldInfoSummary = async (worldInfoId: string) => {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  const { data, error } = await supabase
    .from('world_infos')
    .select('id,name,short_description,creator_id,likes_count,interaction_count,visibility,created_at')
    .eq('id', worldInfoId)
    .maybeSingle();
  if (error || !data) return { data: null, error: error || new Error('Not found') };
  // Tags
  const { data: tagRows } = await supabase
    .from('world_info_tags')
    .select('tags(id,name)')
    .eq('world_info_id', worldInfoId);
  const tags = (tagRows || []).map((r: any) => r.tags).filter(Boolean);
  let isLiked = false;
  let isUsed = false;
  if (userId) {
    const api: any = supabase;
    const { data: likeRow } = await api
      .from('world_info_user_likes')
      .select('user_id')
      .eq('world_info_id', worldInfoId)
      .eq('user_id', userId)
      .maybeSingle();
    isLiked = !!likeRow;
    const { data: useRow } = await api
      .from('world_info_users')
      .select('id')
      .eq('world_info_id', worldInfoId)
      .eq('user_id', userId)
      .maybeSingle();
    isUsed = !!useRow;
  }
  return { data: { ...data, tags, isLiked, isUsed, likesCount: data.likes_count || 0 }, error: null };
};

// New: Full public (or owner) details with entries, tags, interaction flags & creator profile.
export const getPublicWorldInfoDetailsFull = async (worldInfoId: string, currentUserId?: string | null) => {
  const { data: worldInfo, error: worldInfoError } = await supabase
    .from('world_infos')
    .select('*')
    .eq('id', worldInfoId)
    .single();
  if (worldInfoError || !worldInfo) return { data: null, error: worldInfoError || new Error('Not found') };
  const isOwner = currentUserId && worldInfo.creator_id === currentUserId;
  if (worldInfo.visibility !== 'public' && !isOwner) return { data: null, error: new Error('Not accessible') };

  const [{ data: creatorData }, { data: entries }, { data: worldInfoTags }] = await Promise.all([
    supabase.from('profiles').select('username, avatar_url').eq('id', worldInfo.creator_id).maybeSingle(),
    supabase.from('world_info_entries').select('*').eq('world_info_id', worldInfoId).order('created_at', { ascending: false }),
    supabase.from('world_info_tags').select('tag:tags(id, name)').eq('world_info_id', worldInfoId)
  ]);
  const tags = (worldInfoTags || []).map((wt: any) => wt.tag).filter(Boolean);

  let isLiked = false;
  let isUsed = false;
  if (currentUserId) {
    const api: any = supabase;
    const [{ data: likeData }, { data: usageData }] = await Promise.all([
      api.from('world_info_user_likes').select('user_id').eq('world_info_id', worldInfoId).eq('user_id', currentUserId).maybeSingle(),
      api.from('world_info_users').select('id').eq('world_info_id', worldInfoId).eq('user_id', currentUserId).maybeSingle()
    ]);
    isLiked = !!likeData;
    isUsed = !!usageData;
  }
  return { data: { ...worldInfo, entries: entries || [], tags, isLiked, isUsed, likesCount: worldInfo.likes_count || 0, creator: creatorData || null }, error: null };
};

// Backward compatibility alias (will eventually replace old publicProfile export)
export const getPublicWorldInfoDetails = getPublicWorldInfoDetailsFull;

function sanitizeSearchInput(raw: string, maxLen = 100): string {
  if (!raw) return '';
  return raw
    .replace(/[%,"'();]/g, ' ')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}
