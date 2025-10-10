import { supabase } from '@/db/client';
import { Auth } from '@/data';

// NOTE (2025-08-21): This file will absorb logic from publicProfile.ts; that file is marked for deletion.
// Public fetch helpers moved into queries.ts; only toggle/add/remove actions remain here, plus tag management.

const WORLD_TARGET_TYPE = 'world';
const LIKE_REACTION = 'like';
const REACTIONS_TABLE = 'user_reactions';

export const toggleWorldInfoLike = async (worldInfoId: string) => {
  let uid: string | null = null;
  try {
    uid = await Auth.requireAuthId();
  } catch {
    /* anonymous -> like not allowed */
  }

  if (!uid) {
    return { data: null, error: new Error('Not authenticated') };
  }

  const reactionFilter = {
    user_id: uid,
    target_type: WORLD_TARGET_TYPE,
    target_id: worldInfoId,
    reaction_type: LIKE_REACTION,
  };

  const { data: existing, error: fetchError } = await supabase
    .from(REACTIONS_TABLE)
    .select('id')
    .match(reactionFilter)
    .maybeSingle();

  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error('Error checking world info like:', fetchError);
    return { data: null, error: fetchError };
  }

  if (existing) {
    const { error } = await supabase
      .from(REACTIONS_TABLE)
      .delete()
      .match(reactionFilter);

    if (error) {
      console.error('Error removing world info like:', error);
      return { data: null, error };
    }
  } else {
    const { error } = await supabase
      .from(REACTIONS_TABLE)
      .insert({
        ...reactionFilter,
        metadata: {},
      });

    if (error) {
      console.error('Error adding world info like:', error);
      return { data: null, error };
    }
  }

  const { data: updatedWorldInfo, error: countError } = await supabase
    .from('world_infos')
    .select('likes_count')
    .eq('id', worldInfoId)
    .single();

  if (countError) {
    console.error('Error fetching updated likes count:', countError);
    return { data: { isLiked: !existing, likesCount: 0 }, error: countError };
  }

  return {
    data: {
      isLiked: !existing,
      likesCount: updatedWorldInfo?.likes_count ?? 0,
    },
    error: null,
  };
};

export const addWorldInfoToCollection = async (worldInfoId: string) => {
  const uid = await Auth.requireAuthId();
  const api: any = supabase;
  const { data: existing } = await api
    .from('world_info_users')
    .select('id')
    .eq('world_info_id', worldInfoId)
    .eq('user_id', uid)
    .maybeSingle();
  if (existing) return { data: { isUsed: true }, error: null };
  const { error } = await api
    .from('world_info_users')
    .insert({ world_info_id: worldInfoId, user_id: uid });
  if (error) return { error };
  await supabase.rpc('increment_world_info_interaction_count', { world_info_id: worldInfoId });
  return { data: { isUsed: true }, error: null };
};

export const removeWorldInfoFromCollection = async (worldInfoId: string) => {
  const uid = await Auth.requireAuthId();
  const api: any = supabase;
  const { data: existing } = await api
    .from('world_info_users')
    .select('id')
    .eq('world_info_id', worldInfoId)
    .eq('user_id', uid)
    .maybeSingle();
  if (!existing) return { data: { isUsed: false }, error: null };
  const { error } = await api
    .from('world_info_users')
    .delete()
    .eq('world_info_id', worldInfoId)
    .eq('user_id', uid);
  if (error) return { error };
  await supabase.rpc('decrement_world_info_interaction_count', { world_info_id: worldInfoId });
  return { data: { isUsed: false }, error: null };
};

// Tag management (moved from mutations.ts for consolidation)
export const addWorldInfoTag = async (worldInfoId: string, tagId: number) => {
  const uid = await Auth.requireAuthId();
  const { error } = await supabase.from('world_info_tags').insert({ world_info_id: worldInfoId, tag_id: tagId });
  return { error };
};

export const removeWorldInfoTag = async (worldInfoId: string, tagId: number) => {
  const uid = await Auth.requireAuthId();
  const { error } = await supabase
    .from('world_info_tags')
    .delete()
    .eq('world_info_id', worldInfoId)
    .eq('tag_id', tagId);
  return { error };
};
