import { supabase } from '@/db/client';

export const getUserCharacters = async (userId: string) => {
  const { data, error } = await supabase
    .from('characters')
    .select(`
      id,
      name,
      short_description,
      tagline,
      avatar_url,
      visibility,
      interaction_count,
      created_at,
      updated_at,
      likes_count,
      chats_count,
      character_definitions!inner(
        personality_summary,
        scenario
      )
    `)
    .eq('creator_id', userId)
    .order('updated_at', { ascending: false });
  if (error || !data) return { data: data || [], error };
  const charactersWithCounts = data.map(character => ({
    ...character,
    likes_count: character.likes_count || 0,
    chats_count: character.chats_count || 0,
    tagline: (() => {
      try {
        const personalitySummary = JSON.parse((character as any).character_definitions?.personality_summary || '{}');
        return personalitySummary.title || (character.character_definitions as any)?.scenario?.title || character.short_description || '';
      } catch {
        return (character.character_definitions as any)?.scenario?.title || character.short_description || '';
      }
    })()
  }));
  return { data: charactersWithCounts, error: null };
};
