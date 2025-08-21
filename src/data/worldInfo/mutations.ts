import { supabase } from '@/db/client';

/**
 * BASIC OPERATIONS
 */
export const deleteWorldInfo = async (worldInfoId: string, userId: string) => {
  // Verify ownership first
  const { data: wi, error: fetchError } = await supabase
    .from('world_infos')
    .select('id, creator_id')
    .eq('id', worldInfoId)
    .single();
  if (fetchError) return { error: fetchError };
  if (!wi || wi.creator_id !== userId) return { error: new Error('Not authorized') };
  const { error } = await supabase.from('world_infos').delete().eq('id', worldInfoId);
  return { error };
};

export const updateWorldInfoVisibility = async (
  worldInfoId: string,
  visibility: 'public' | 'private',
  userId: string
) => {
  const { data: wi, error: fetchError } = await supabase
    .from('world_infos')
    .select('id, creator_id')
    .eq('id', worldInfoId)
    .single();
  if (fetchError) return { error: fetchError };
  if (!wi || wi.creator_id !== userId) return { error: new Error('Not authorized') };
  const { data, error } = await supabase
    .from('world_infos')
    .update({ visibility })
    .eq('id', worldInfoId)
    .select('visibility')
    .single();
  if (error) return { error };
  return { data, error: null };
};

export const createWorldInfo = async (worldInfo: { name: string; short_description?: string; visibility: 'public' | 'unlisted' | 'private' }) => {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { data: null, error: new Error('Not authenticated') };
  const { data, error } = await supabase
    .from('world_infos')
    .insert({
      creator_id: user.user.id,
      name: worldInfo.name,
      short_description: worldInfo.short_description,
      visibility: worldInfo.visibility
    })
    .select()
    .single();
  return { data, error };
};

export const updateWorldInfoCore = async (
  worldInfoId: string,
  updates: { name: string; short_description?: string; visibility: 'public' | 'unlisted' | 'private' }
) => {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { data: null, error: new Error('Not authenticated') };
  const { data, error } = await supabase
    .from('world_infos')
    .update({
      name: updates.name,
      short_description: updates.short_description,
      visibility: updates.visibility
    })
    .eq('id', worldInfoId)
    .eq('creator_id', user.user.id)
    .select()
    .single();
  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error('Not found') };
  return { data, error: null };
};

export const cascadeDeleteWorldInfo = async (worldInfoId: string) => {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { error: new Error('Not authenticated') };
  const { data: wi } = await supabase
    .from('world_infos')
    .select('id, creator_id')
    .eq('id', worldInfoId)
    .single();
  if (!wi || wi.creator_id !== user.user.id) return { error: new Error('Not authorized') };
  // Delete dependents (order matters for FK constraints)
  await (supabase as any).from('world_info_entries').delete().eq('world_info_id', worldInfoId);
  await (supabase as any).from('world_info_tags').delete().eq('world_info_id', worldInfoId);
  await (supabase as any).from('world_info_user_likes').delete().eq('world_info_id', worldInfoId);
  await (supabase as any).from('world_info_users').delete().eq('world_info_id', worldInfoId);
  const { error } = await supabase.from('world_infos').delete().eq('id', worldInfoId);
  return { error };
};

export const addWorldInfoEntry = async (
  worldInfoId: string,
  entry: { keywords: string[]; entry_text: string }
) => {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { data: null, error: new Error('Not authenticated') };
  const { data: wi } = await supabase
    .from('world_infos')
    .select('creator_id')
    .eq('id', worldInfoId)
    .single();
  if (!wi || wi.creator_id !== user.user.id) return { data: null, error: new Error('Unauthorized') };
  const { data, error } = await supabase
    .from('world_info_entries')
    .insert({ world_info_id: worldInfoId, keywords: entry.keywords, entry_text: entry.entry_text })
    .select()
    .single();
  return { data, error };
};

export const updateWorldInfoEntry = async (
  entryId: string,
  entry: { keywords: string[]; entry_text: string }
) => {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { data: null, error: new Error('Not authenticated') };
  const { data: existing } = await supabase
    .from('world_info_entries')
    .select('world_info_id, world_infos!inner(creator_id)')
    .eq('id', entryId)
    .single();
  if (!existing || (existing as any).world_infos.creator_id !== user.user.id) {
    return { data: null, error: new Error('Unauthorized') };
  }
  const { data, error } = await supabase
    .from('world_info_entries')
    .update({ keywords: entry.keywords, entry_text: entry.entry_text })
    .eq('id', entryId)
    .select()
    .single();
  return { data, error };
};

export const deleteWorldInfoEntry = async (entryId: string) => {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { error: new Error('Not authenticated') };
  const { data: existing } = await supabase
    .from('world_info_entries')
    .select('world_info_id, world_infos!inner(creator_id)')
    .eq('id', entryId)
    .single();
  if (!existing || (existing as any).world_infos.creator_id !== user.user.id) {
    return { error: new Error('Unauthorized') };
  }
  const { error } = await supabase.from('world_info_entries').delete().eq('id', entryId);
  return { error };
};

/**
 * EXTENDED OPERATIONS (merged from deprecated extendedMutations.ts)
 */
export const createWorldInfoFull = async (d: { name: string; short_description?: string; visibility: 'public' | 'unlisted' | 'private' }) => {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');
  const { data, error } = await supabase.from('world_infos').insert({ creator_id: user.user.id, name: d.name, short_description: d.short_description, visibility: d.visibility }).select().single();
  if (error || !data) throw new Error('Failed to create world info');
  return data;
};

export const getWorldInfosByUserFull = async () => {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');
  const { data, error } = await supabase.from('world_infos').select('*').eq('creator_id', user.user.id).order('created_at', { ascending: false });
  if (error) throw new Error('Failed to fetch world infos');
  const list = data || [];
  const enriched = await Promise.all(list.map(async (w) => {
    const { count: entriesCount } = await supabase.from('world_info_entries').select('*', { count: 'exact', head: true }).eq('world_info_id', w.id);
    const { count: likesCount } = await supabase.from('world_info_user_likes').select('*', { count: 'exact', head: true }).eq('world_info_id', w.id);
    const { data: tags } = await supabase.from('world_info_tags').select('tag:tags(id,name)').eq('world_info_id', w.id);
    return { ...w, entriesCount: entriesCount || 0, likesCount: likesCount || 0, tags: (tags || []).map(t => (t as any).tag) };
  }));
  return enriched;
};

export const getWorldInfoWithEntriesFull = async (id: string) => {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');
  const { data, error } = await supabase.from('world_infos').select('*').eq('id', id).single();
  if (error || !data) throw new Error('Failed to fetch world info');
  const { data: entries, error: entriesError } = await supabase.from('world_info_entries').select('*').eq('world_info_id', id).order('created_at', { ascending: false });
  if (entriesError) throw new Error('Failed to fetch world info entries');
  return { ...data, entries: entries || [] };
};

export const updateWorldInfoFull = async (id: string, d: { name: string; short_description?: string; visibility: 'public' | 'unlisted' | 'private' }) => {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');
  const { data, error } = await supabase.from('world_infos').update({ name: d.name, short_description: d.short_description, visibility: d.visibility }).eq('id', id).eq('creator_id', user.user.id).select().single();
  if (error || !data) throw new Error(error.message || 'Failed to update world info');
  return data;
};

export const deleteWorldInfoFull = async (id: string) => {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');
  const { data: wi } = await supabase.from('world_infos').select('id,creator_id').eq('id', id).single();
  if (!wi || wi.creator_id !== user.user.id) throw new Error('Not authorized to delete');
  await (supabase as any).from('world_info_entries').delete().eq('world_info_id', id);
  await (supabase as any).from('world_info_tags').delete().eq('world_info_id', id);
  await (supabase as any).from('world_info_user_likes').delete().eq('world_info_id', id);
  await (supabase as any).from('world_info_users').delete().eq('world_info_id', id);
  const { error } = await supabase.from('world_infos').delete().eq('id', id);
  if (error) throw new Error('Failed to delete world info');
  return { success: true };
};

export const addWorldInfoEntryFull = async (worldInfoId: string, entry: { keywords: string[]; entry_text: string }) => {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');
  const { data: wi } = await supabase.from('world_infos').select('creator_id').eq('id', worldInfoId).single();
  if (!wi || wi.creator_id !== user.user.id) throw new Error('Unauthorized');
  const { data, error } = await supabase.from('world_info_entries').insert({ world_info_id: worldInfoId, keywords: entry.keywords, entry_text: entry.entry_text }).select().single();
  if (error || !data) throw new Error('Failed to add world info entry');
  return data;
};

export const updateWorldInfoEntryFull = async (entryId: string, entry: { keywords: string[]; entry_text: string }) => {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');
  const { data: existing } = await supabase.from('world_info_entries').select('world_info_id, world_infos!inner(creator_id)').eq('id', entryId).single();
  if (!existing || (existing as any).world_infos.creator_id !== user.user.id) throw new Error('Unauthorized');
  const { data, error } = await supabase.from('world_info_entries').update({ keywords: entry.keywords, entry_text: entry.entry_text }).eq('id', entryId).select().single();
  if (error || !data) throw new Error('Failed to update world info entry');
  return data;
};

export const deleteWorldInfoEntryFull = async (entryId: string) => {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');
  const { data: existing } = await supabase.from('world_info_entries').select('world_info_id, world_infos!inner(creator_id)').eq('id', entryId).single();
  if (!existing || (existing as any).world_infos.creator_id !== user.user.id) throw new Error('Unauthorized');
  const { error } = await supabase.from('world_info_entries').delete().eq('id', entryId);
  if (error) throw new Error('Failed to delete world info entry');
  return true;
};

/**
 * TAG OPERATIONS (migrated from deprecated tags.ts)
 */
export const addWorldInfoTag = async (worldInfoId: string, tagId: number) => {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: new Error('Not authenticated') };
  const { error } = await supabase.from('world_info_tags').insert({ world_info_id: worldInfoId, tag_id: tagId });
  return { error };
};

export const removeWorldInfoTag = async (worldInfoId: string, tagId: number) => {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: new Error('Not authenticated') };
  const { error } = await supabase
    .from('world_info_tags')
    .delete()
    .eq('world_info_id', worldInfoId)
    .eq('tag_id', tagId);
  return { error };
};
