import { supabase } from '@/db/client';
import { Auth } from '@/data';

export const createCharacter = async (characterData: {
  name: string;
  short_description?: string;
  avatar_url?: string;
  visibility?: 'public' | 'unlisted' | 'private';
  definition: string;
  greeting?: string;
  long_description?: string;
}) => {
  const uid = await Auth.requireAuthId();
  const { data: character, error: characterError } = await supabase
    .from('characters')
    .insert({
      creator_id: uid,
      name: characterData.name,
      short_description: characterData.short_description,
      avatar_url: characterData.avatar_url,
      visibility: characterData.visibility || 'private',
    })
    .select()
    .single();
  if (characterError || !character) return { data: null, error: characterError };
  const { error: definitionError } = await supabase
    .from('character_definitions')
    .insert({
      character_id: character.id,
      personality_summary: characterData.definition,
      greeting: characterData.greeting,
      description: characterData.long_description,
    });
  if (definitionError) {
    await supabase.from('characters').delete().eq('id', character.id);
    return { data: null, error: definitionError };
  }
  return { data: character, error: null };
};

export const deletePrivateCharacter = async (characterId: string) => {
  try {
    const { data, error } = await (supabase as any).rpc('delete_private_character', { p_character_id: characterId });
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
};
