import { supabase } from '@/db/client';

export const saveUserCharacterWorldInfo = async (userId: string, characterId: string, worldInfoId: string) => {
  // Remove any existing row
  await supabase
    .from('user_character_world_info_settings')
    .delete()
    .eq('user_id', userId)
    .eq('character_id', characterId);
  const { error } = await supabase
    .from('user_character_world_info_settings')
    .insert({ user_id: userId, character_id: characterId, world_info_id: worldInfoId });
  return { error, success: !error };
};

export const getUserCharacterWorldInfo = async (userId: string, characterId: string) => {
  const { data, error } = await supabase
    .from('user_character_world_info_settings')
    .select('world_info_id')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .maybeSingle();
  if (error) return { worldInfoId: null, error };
  return { worldInfoId: data?.world_info_id || null, error: null };
};

export const removeUserCharacterWorldInfo = async (userId: string, characterId: string) => {
  const { error } = await supabase
    .from('user_character_world_info_settings')
    .delete()
    .eq('user_id', userId)
    .eq('character_id', characterId);
  return { error, success: !error };
};

export const canUserAccessWorldInfo = async (userId: string, worldInfoId: string) => {
  // Owns?
  const { data: owned, error: ownErr } = await supabase
    .from('world_infos')
    .select('id')
    .eq('id', worldInfoId)
    .eq('creator_id', userId)
    .maybeSingle();
  if (ownErr) return { hasAccess: false, error: ownErr };
  if (owned) return { hasAccess: true, error: null };
  const { data: inCollection, error: collErr } = await (supabase as any)
    .from('world_info_users')
    .select('id')
    .eq('user_id', userId)
    .eq('world_info_id', worldInfoId)
    .maybeSingle();
  if (collErr) return { hasAccess: false, error: collErr };
  return { hasAccess: !!inCollection, error: null };
};
