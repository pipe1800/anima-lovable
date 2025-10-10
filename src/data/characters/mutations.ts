import type { PostgrestSingleResponse } from '@supabase/supabase-js';

import { supabase } from '@/db/client';
import { callRpc } from '@/db/rpc';
import type { Json } from '@/integrations/supabase/types';
import { Auth } from '@/data';

export interface CreateCharacterInput {
  name: string;
  short_description?: string;
  avatar_url?: string;
  visibility?: 'public' | 'unlisted' | 'private';
  definition: string;
  greeting?: string;
  long_description?: string;
}

interface CharacterRow {
  id: string;
  creator_id: string;
  name: string;
  short_description: string | null;
  avatar_url: string | null;
  visibility: 'public' | 'unlisted' | 'private';
  created_at: string;
  updated_at: string;
}

export const createCharacter = async (characterData: CreateCharacterInput) => {
  const uid = await Auth.requireAuthId();
  const insertResult = await supabase
    .from('characters')
    .insert({
      creator_id: uid,
      name: characterData.name,
      short_description: characterData.short_description,
      avatar_url: characterData.avatar_url,
      visibility: characterData.visibility || 'private',
    })
    .select('*')
    .single();

  const { data: character, error: characterError } = insertResult as PostgrestSingleResponse<CharacterRow>;
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

export const deletePrivateCharacter = (
  characterId: string,
): Promise<PostgrestSingleResponse<Json | null>> =>
  callRpc<Json | null>(supabase, 'delete_private_character', {
    p_character_id: characterId,
  });
