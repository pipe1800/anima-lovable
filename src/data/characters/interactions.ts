import { supabase } from '@/db/client';

const REACTIONS_TABLE = 'user_reactions';
const CHARACTER_TARGET = 'character';
const LIKE_REACTION = 'like';
const FAVORITE_REACTION = 'favorite';

type CharacterReaction = typeof LIKE_REACTION | typeof FAVORITE_REACTION;

type UserReactionRow = {
  target_id: string | null;
  created_at: string;
};

type CharacterFavoriteSummary = {
  id: string;
  name: string;
  short_description: string | null;
  avatar_url: string | null;
  visibility: string;
  likes_count: number | null;
  favorites_count: number | null;
  chats_count: number | null;
  interaction_count: number | null;
  creator_id: string;
  created_at: string;
  tagline: string | null;
};

const reactionFilter = (characterId: string, userId: string, reactionType: CharacterReaction) => ({
  target_type: CHARACTER_TARGET,
  target_id: characterId,
  reaction_type: reactionType,
  user_id: userId,
});

async function hasCharacterReaction(characterId: string, userId: string, reactionType: CharacterReaction) {
  const { data, error } = await supabase
    .from(REACTIONS_TABLE)
    .select('id')
    .match(reactionFilter(characterId, userId, reactionType))
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('Error checking character reaction:', error);
  }

  return !!data;
}

async function toggleCharacterReaction(characterId: string, userId: string, reactionType: CharacterReaction) {
  const filter = reactionFilter(characterId, userId, reactionType);
  const { data: existing, error: fetchError } = await supabase
    .from(REACTIONS_TABLE)
    .select('id')
    .match(filter)
    .maybeSingle();

  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error('Error checking character reaction before toggle:', fetchError);
    throw fetchError;
  }

  if (existing) {
    const { error } = await supabase
      .from(REACTIONS_TABLE)
      .delete()
      .match(filter);

    if (error) {
      console.error('Error removing character reaction:', error);
      throw error;
    }

    return false;
  }

  const { error } = await supabase
    .from(REACTIONS_TABLE)
    .insert({
      ...filter,
      metadata: {},
    });

  if (error) {
    console.error('Error adding character reaction:', error);
    throw error;
  }

  return true;
}

/** Check if user liked a character */
export function isCharacterLiked(characterId: string, userId: string) {
  return hasCharacterReaction(characterId, userId, LIKE_REACTION);
}

/** Toggle like returns new state */
export function toggleCharacterLike(characterId: string, userId: string) {
  return toggleCharacterReaction(characterId, userId, LIKE_REACTION);
}

/** Check if favorited */
export function isCharacterFavorited(characterId: string, userId: string) {
  return hasCharacterReaction(characterId, userId, FAVORITE_REACTION);
}

/** Toggle favorite */
export function toggleCharacterFavorite(characterId: string, userId: string) {
  return toggleCharacterReaction(characterId, userId, FAVORITE_REACTION);
}

/** Get user favorites (moved from favorites.ts for consolidation) */
export async function getUserFavorites(userId: string) {
  const { data: favorites, error } = await supabase
    .from(REACTIONS_TABLE)
    .select('target_id, created_at')
    .eq('user_id', userId)
    .eq('target_type', CHARACTER_TARGET)
    .eq('reaction_type', FAVORITE_REACTION)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], error };
  }

  const ids = ((favorites as UserReactionRow[]) || [])
    .map(f => f.target_id)
    .filter((id): id is string => !!id);

  if (!ids.length) {
    return { data: [], error: null };
  }

  const { data: characters, error: charactersError } = await supabase
    .from('characters')
    .select('id, name, short_description, avatar_url, visibility, likes_count, favorites_count, chats_count, interaction_count, creator_id, created_at, tagline')
    .in('id', ids)
    .eq('visibility', 'public');

  if (charactersError || !characters) {
    return { data: [], error: charactersError };
  }

  const orderMap = new Map(ids.map((id, idx) => [id, idx]));
  const sorted = [...(characters as CharacterFavoriteSummary[])].sort(
    (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)
  );

  return { data: sorted, error: null };
}
