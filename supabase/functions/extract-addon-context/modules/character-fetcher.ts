// Thin delegation wrapper to unified implementation in chat-management database module.
// Maintains existing import surface for extract-addon-context without duplicating logic.
import { fetchCharacterData as unifiedFetchCharacterData, buildTemplateReplacer } from '../../chat-management/modules/database.ts';
export async function fetchCharacterData(characterId, supabase, options) {
  return unifiedFetchCharacterData(characterId, supabase, options);
}
export async function fetchUserData(userId, supabase) {
  try {
    const [personaRes, profileRes] = await Promise.allSettled([
      supabase.from('personas').select('*').eq('user_id', userId).limit(1).single(),
      supabase.from('profiles').select('username').eq('id', userId).single()
    ]);
    return {
      persona: personaRes.status === 'fulfilled' ? personaRes.value.data : null,
      profile: profileRes.status === 'fulfilled' ? profileRes.value.data : null
    };
  } catch (e) {
    console.warn('userData.fetch.warn', e?.message);
    return {
      persona: null,
      profile: null
    };
  }
}
export function getCharacterForContext(character) {
  return {
    personality_summary: character?.character_definitions?.personality_summary || '',
    description: character?.character_definitions?.description || '',
    scenario: character?.character_definitions?.scenario || '',
    greeting: character?.character_definitions?.greeting || ''
  };
}
export function createTemplateReplacer(persona, profile, character) {
  return buildTemplateReplacer({
    userName: persona?.name || profile?.username || 'User',
    charName: character?.name || 'Character'
  });
}
