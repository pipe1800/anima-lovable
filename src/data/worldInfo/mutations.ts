import { supabase } from '@/db/client';
import { Auth } from '@/data';

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
  const uid = await Auth.requireAuthId();
  const { data, error } = await supabase
    .from('world_infos')
    .insert({
      creator_id: uid,
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
  const uid = await Auth.requireAuthId();
  const { data, error } = await supabase
    .from('world_infos')
    .update({
      name: updates.name,
      short_description: updates.short_description,
      visibility: updates.visibility
    })
    .eq('id', worldInfoId)
    .eq('creator_id', uid)
    .select()
    .single();
  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error('Not found') };
  return { data, error: null };
};

export const cascadeDeleteWorldInfo = async (worldInfoId: string) => {
  const uid = await Auth.requireAuthId();
  const { data: wi } = await supabase
    .from('world_infos')
    .select('id, creator_id')
    .eq('id', worldInfoId)
    .single();
  if (!wi || wi.creator_id !== uid) return { error: new Error('Not authorized') };
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
  const uid = await Auth.requireAuthId();
  const { data: wi } = await supabase
    .from('world_infos')
    .select('creator_id')
    .eq('id', worldInfoId)
    .single();
  if (!wi || wi.creator_id !== uid) return { data: null, error: new Error('Unauthorized') };
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
  const uid = await Auth.requireAuthId();
  const { data: existing } = await supabase
    .from('world_info_entries')
    .select('world_info_id, world_infos!inner(creator_id)')
    .eq('id', entryId)
    .single();
  if (!existing || (existing as any).world_infos.creator_id !== uid) {
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
  const uid = await Auth.requireAuthId();
  const { data: existing } = await supabase
    .from('world_info_entries')
    .select('world_info_id, world_infos!inner(creator_id)')
    .eq('id', entryId)
    .single();
  if (!existing || (existing as any).world_infos.creator_id !== uid) {
    return { error: new Error('Unauthorized') };
  }
  const { error } = await supabase.from('world_info_entries').delete().eq('id', entryId);
  return { error };
};

/**
 * EXTENDED OPERATIONS REMOVED: createWorldInfoFull, getWorldInfosByUserFull, getWorldInfoWithEntriesFull, updateWorldInfoFull,
 * deleteWorldInfoFull, addWorldInfoEntryFull, updateWorldInfoEntryFull, deleteWorldInfoEntryFull.
 * All replaced by RPC-based consolidated functions + basic mutations above.
 */
