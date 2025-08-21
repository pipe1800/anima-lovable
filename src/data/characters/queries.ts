import { supabase } from '@/db/client';
import { SearchParams, SearchResult } from '../shared/searchTypes';

export const getPublicCharacters = async (limit = 20, offset = 0, nsfwEnabled = true) => {
  const { data, error } = await supabase
    .from('characters')
    .select(`
      id,
      name,
      short_description,
      avatar_url,
      interaction_count,
      created_at,
      creator_id,
      likes_count,
      favorites_count,
      chats_count
    `)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error || !data) return { data: [], error };
  let filteredData = data;
  if (!nsfwEnabled) {
    const { data: nsfwCharacters } = await supabase
      .from('character_tags')
      .select('character_id')
      .eq('tag_id', 24);
    if (nsfwCharacters?.length) {
      const nsfwIds = new Set(nsfwCharacters.map(c => c.character_id));
      filteredData = filteredData.filter(char => !nsfwIds.has(char.id));
    }
  }
  if (!filteredData.length) return { data: [], error: null };
  const creatorIds = [...new Set(filteredData.map(c => c.creator_id))];
  const [creatorsRes, tagsRes] = await Promise.all([
    creatorIds.length ? supabase.from('public_profiles').select('id, username, avatar_url').in('id', creatorIds) : Promise.resolve({ data: [] }),
    supabase.from('character_tags').select('character_id, tag:tags(id, name)').in('character_id', filteredData.map(c => c.id))
  ]);
  const creatorsMap = new Map((creatorsRes.data || []).map(c => [c.id, c]));
  const tagMap = new Map<string, Array<{ id: number; name: string }>>();
  (tagsRes.data || []).forEach((r: any) => {
    const arr = tagMap.get(r.character_id) || [];
    if (r.tag) arr.push(r.tag);
    tagMap.set(r.character_id, arr);
  });
  const charactersWithCreators = filteredData.map(character => ({
    ...character,
    creator: creatorsMap.get(character.creator_id) || null,
    tags: tagMap.get(character.id) || []
  }));
  return { data: charactersWithCreators, error: null };
};

export const searchPublicCharacters = async (params: SearchParams): Promise<SearchResult<any>> => {
  const { searchQuery, sortBy, filters, limit, offset } = params;
  let query = supabase
    .from('characters')
    .select(`
      id,
      name,
      short_description,
      avatar_url,
      interaction_count,
      created_at,
      creator_id,
      likes_count,
      favorites_count,
      chats_count
    `, { count: 'exact' })
    .eq('visibility', 'public');
  if (searchQuery && searchQuery.trim()) {
    const sanitized = sanitizeSearchInput(searchQuery);
    if (sanitized) {
      query = query.or(`name.ilike.%${sanitized}%,short_description.ilike.%${sanitized}%`);
    }
  }
  if (filters.creator && filters.creator.trim()) {
    const { data: creators } = await supabase
      .from('public_profiles')
      .select('id')
      .ilike('username', `%${filters.creator}%`);
    if (creators && creators.length > 0) {
      const creatorIds = creators.map(c => c.id);
      query = query.in('creator_id', creatorIds);
    } else {
      return { data: [], total: 0, hasMore: false };
    }
  }
  switch (sortBy) {
    case 'newest':
      query = query.order('created_at', { ascending: false });
      break;
    case 'conversations':
    case 'popular':
    default:
      query = query.order('interaction_count', { ascending: false });
      break;
  }
  query = query.range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error || !data) {
    return { data: [], total: 0, hasMore: false, error };
  }
  let filteredData = data;
  if (filters.nsfw === false) {
    const { data: nsfwCharacters } = await supabase
      .from('character_tags')
      .select('character_id')
      .eq('tag_id', 24);
    if (nsfwCharacters && nsfwCharacters.length > 0) {
      const nsfwCharacterIds = new Set(nsfwCharacters.map(c => c.character_id));
      filteredData = filteredData.filter(char => !nsfwCharacterIds.has(char.id));
    }
  }
  if (filters.tags && filters.tags.length > 0) {
    const { data: characterTags } = await supabase
      .from('character_tags')
      .select(`
        character_id,
        tag:tags(name)
      `)
      .in('character_id', filteredData.map(c => c.id));
    const charactersWithTags = new Set<string>();
    characterTags?.forEach(ct => {
      if (ct.tag && filters.tags!.includes(ct.tag.name)) {
        charactersWithTags.add(ct.character_id);
      }
    });
    filteredData = filteredData.filter(c => charactersWithTags.has(c.id));
  }
  const creatorIdsBatch = Array.from(new Set(filteredData.map(c => c.creator_id)));
  const charIdsBatch = filteredData.map(c => c.id);
  const [creatorsBatchRes, tagsBatchRes, likesBatchRes, favsBatchRes, chatsBatchRes] = await Promise.all([
    creatorIdsBatch.length ? supabase.from('public_profiles').select('id, username, avatar_url').in('id', creatorIdsBatch) : Promise.resolve({ data: [] }),
    charIdsBatch.length ? supabase.from('character_tags').select('character_id, tag:tags(id, name)').in('character_id', charIdsBatch) : Promise.resolve({ data: [] }),
    charIdsBatch.length ? supabase.from('character_likes').select('character_id, id').in('character_id', charIdsBatch) : Promise.resolve({ data: [] }),
    charIdsBatch.length ? supabase.from('character_favorites').select('character_id, id').in('character_id', charIdsBatch) : Promise.resolve({ data: [] }),
    charIdsBatch.length ? supabase.from('chats').select('character_id, id').in('character_id', charIdsBatch) : Promise.resolve({ data: [] })
  ] as any);
  const creatorsMapBatch = new Map((creatorsBatchRes.data || []).map((c: any) => [c.id, c]));
  const tagsMapBatch = new Map<string, Array<{ id: number; name: string }>>();
  (tagsBatchRes.data || []).forEach((row: any) => {
    const existing = tagsMapBatch.get(row.character_id) || [];
    if (row.tag) existing.push(row.tag);
    tagsMapBatch.set(row.character_id, existing);
  });
  const likeCountsBatch = new Map<string, number>();
  (likesBatchRes.data || []).forEach((r: any) => likeCountsBatch.set(r.character_id, (likeCountsBatch.get(r.character_id) || 0) + 1));
  const favCountsBatch = new Map<string, number>();
  (favsBatchRes.data || []).forEach((r: any) => favCountsBatch.set(r.character_id, (favCountsBatch.get(r.character_id) || 0) + 1));
  const chatCountsBatch = new Map<string, number>();
  (chatsBatchRes.data || []).forEach((r: any) => chatCountsBatch.set(r.character_id, (chatCountsBatch.get(r.character_id) || 0) + 1));
  const charactersWithDetails = filteredData.map(character => ({
    ...character,
    creator: creatorsMapBatch.get(character.creator_id) || null,
    chats_count: chatCountsBatch.get(character.id) || 0,
    likes_count: likeCountsBatch.get(character.id) || 0,
    favorites_count: favCountsBatch.get(character.id) || 0,
    tags: tagsMapBatch.get(character.id) || []
  }));
  if (sortBy === 'conversations') {
    charactersWithDetails.sort((a, b) => (b.chats_count || 0) - (a.chats_count || 0));
  }
  const total = count || 0;
  const hasMore = offset + limit < total;
  return { data: charactersWithDetails, total, hasMore };
};

export const getTagsByNames = async (names: string[]) => {
  if (!names.length) return { data: [], error: null };
  const { data, error } = await supabase
    .from('tags')
    .select('id, name')
    .in('name', names);
  return { data: data || [], error };
};

export const getTagByNameInsensitive = async (name: string) => {
  const { data, error } = await supabase
    .from('tags')
    .select('id, name')
    .ilike('name', name)
    .maybeSingle();
  return { data, error };
};

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
