import { supabase } from '@/db/client';

// NOTE (2025-08-21): This file will absorb logic from publicProfile.ts; that file is marked for deletion.
// Public fetch helpers will move into queries.ts; only toggle/add/remove actions remain here.

export const toggleWorldInfoLike = async (worldInfoId: string) => {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: new Error('Not authenticated') };
  const { data, error } = await supabase.rpc('toggle_world_info_like', { p_world_info_id: worldInfoId });
  if (error) return { data: null, error };
  const payload = (data as any) || {};
  return { data: { isLiked: !!payload.liked, likesCount: payload.likes_count ?? 0 }, error: null };
};

export const addWorldInfoToCollection = async (worldInfoId: string) => {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: new Error('Not authenticated') };
  const api: any = supabase;
  const { data: existing } = await api
    .from('world_info_users')
    .select('id')
    .eq('world_info_id', worldInfoId)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (existing) return { data: { isUsed: true }, error: null };
  const { error } = await api
    .from('world_info_users')
    .insert({ world_info_id: worldInfoId, user_id: auth.user.id });
  if (error) return { error };
  await supabase.rpc('increment_world_info_interaction_count', { world_info_id: worldInfoId });
  return { data: { isUsed: true }, error: null };
};

export const removeWorldInfoFromCollection = async (worldInfoId: string) => {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: new Error('Not authenticated') };
  const api: any = supabase;
  const { data: existing } = await api
    .from('world_info_users')
    .select('id')
    .eq('world_info_id', worldInfoId)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!existing) return { data: { isUsed: false }, error: null };
  const { error } = await api
    .from('world_info_users')
    .delete()
    .eq('world_info_id', worldInfoId)
    .eq('user_id', auth.user.id);
  if (error) return { error };
  await supabase.rpc('decrement_world_info_interaction_count', { world_info_id: worldInfoId });
  return { data: { isUsed: false }, error: null };
};
