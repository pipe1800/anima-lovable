import { supabase } from '@/db/client';

export const getRecommendedCharacters = async (tags: string[], limit = 4) => {
  try {
    let charactersQuery = supabase
      .from('characters')
      .select('id, name, short_description, avatar_url, interaction_count, created_at, likes_count, favorites_count, chats_count, character_definitions!inner(greeting)')
      .eq('visibility', 'public');
    if (tags.length) {
      const { data: tagIds } = await supabase.from('tags').select('id').in('name', tags);
      if (tagIds?.length) {
        const { data: characterIds } = await supabase.from('character_tags').select('character_id').in('tag_id', tagIds.map(t => t.id));
        if (characterIds?.length) charactersQuery = charactersQuery.in('id', characterIds.map(ct => ct.character_id));
      }
    }
    const { data: characters, error } = await charactersQuery.order('interaction_count', { ascending: false }).limit(limit);
    if (error) throw error;
    let finalCharacters = [...(characters || [])];
    if (!characters || characters.length < limit) {
      const remaining = limit - finalCharacters.length;
      if (remaining > 0) {
        const { data: popularCharacters } = await supabase
          .from('characters')
          .select('id, name, short_description, avatar_url, interaction_count, created_at, likes_count, favorites_count, chats_count, character_definitions!inner(greeting)')
          .eq('visibility', 'public')
          .order('interaction_count', { ascending: false })
          .limit(limit);
        const existing = new Set(finalCharacters.map(c => c.id));
        (popularCharacters || []).forEach(pc => { if (finalCharacters.length < limit && !existing.has(pc.id)) finalCharacters.push(pc); });
      }
    }
    return { data: finalCharacters.slice(0, limit), error: null };
  } catch (error) {
    return { data: [], error };
  }
};
