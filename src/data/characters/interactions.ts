import { supabase } from '@/db/client';

/** Check if user liked a character */
export async function isCharacterLiked(characterId: string, userId: string) {
  const { data } = await supabase
    .from('character_likes')
    .select('id')
    .eq('character_id', characterId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

/** Toggle like returns new state */
export async function toggleCharacterLike(characterId: string, userId: string) {
  const liked = await isCharacterLiked(characterId, userId);
  if (liked) {
    await supabase.from('character_likes').delete().eq('character_id', characterId).eq('user_id', userId);
    return false;
  } else {
    await supabase.from('character_likes').insert([{ character_id: characterId, user_id: userId }]);
    return true;
  }
}

/** Check if favorited */
export async function isCharacterFavorited(characterId: string, userId: string) {
  const { data } = await supabase
    .from('character_favorites')
    .select('id')
    .eq('character_id', characterId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

/** Toggle favorite */
export async function toggleCharacterFavorite(characterId: string, userId: string) {
  const favorited = await isCharacterFavorited(characterId, userId);
  if (favorited) {
    await supabase.from('character_favorites').delete().eq('character_id', characterId).eq('user_id', userId);
    return false;
  } else {
    await supabase.from('character_favorites').insert([{ character_id: characterId, user_id: userId }]);
    return true;
  }
}

/** Get user favorites (moved from favorites.ts for consolidation) */
export async function getUserFavorites(userId: string) {
  const { data: favorites, error } = await supabase
    .from('character_favorites')
    .select('character_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error };
  const ids = (favorites || []).map(f => f.character_id).filter(Boolean);
  if (!ids.length) return { data: [], error: null };
  const { data: chars, error: charsError } = await supabase
    .from('characters')
    .select('id, name, short_description, avatar_url, visibility, likes_count, favorites_count, chats_count, interaction_count, creator_id, created_at, tagline')
    .in('id', ids)
    .eq('visibility', 'public');
  if (charsError || !chars) return { data: [], error: charsError };
  const orderMap = new Map(ids.map((id, idx) => [id, idx]));
  const sorted = [...chars].sort((a: any, b: any) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
  return { data: sorted, error: null };
}
