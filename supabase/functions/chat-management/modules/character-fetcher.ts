/**
 * Character Data Fetching Module
 * 
 * Handles fetching character information with fallback logic
 * for the extract-chat-context function
 */

import type { 
  Character
} from '../types/streaming-interfaces.ts';

// Define missing types locally
interface CharacterData extends Character {
  world_info?: any[];
  context_settings?: any;
}

interface UserPersona {
  id: string;
  name?: string;
  bio?: string;
  lore?: string;
}

interface UserProfile {
  id: string;
  username?: string;
}

/**
 * Fetch comprehensive character data with fallback logic
 */
export async function fetchCharacterData(
  characterId: string,
  supabase: any
): Promise<CharacterData> {
  try {
    // Try to get character from characters table with all relations
    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select(`
        id, name, personality, description, instructions, scenario, example_conversations, greeting,
        personality_summary,
        context_settings,
        character_definitions (*),
        world_info:world_infos(
          id, name, description, world_id,
          worlds(id, name, description)
        )
      `)
      .eq('id', characterId)
      .single();

    if (character && !characterError) {
      console.log('✅ Character data fetched from characters table');
      return character;
    }

    // Fallback: Try character_definitions if not found in characters
    console.log('Character not found in characters table, trying character_definitions...');
    const { data: def, error: defError } = await supabase
      .from('character_definitions')
      .select('*')
      .eq('character_id', characterId)
      .single();
    
    if (def && !defError) {
      const fallbackCharacter: CharacterData = {
        id: characterId,
        name: def.name || 'Unknown Character',
        personality_summary: def.personality_summary,
        description: def.description,
        scenario: def.scenario,
        greeting: def.greeting,
        character_definitions: def,
      };
      console.log('✅ Fallback: Found character in character_definitions only');
      return fallbackCharacter;
    }

    // If both fail, throw error
    console.error('Character fetch error:', characterError);
    console.error('Character_definitions fetch error:', defError);
    throw new Error('Character not found');

  } catch (error) {
    console.error('❌ Failed to fetch character data:', error);
    throw new Error(`Failed to fetch character: ${error.message}`);
  }
}

/**
 * Fetch user persona and profile data in parallel
 */
export async function fetchUserData(
  userId: string,
  supabase: any
): Promise<{ persona: UserPersona | null; profile: UserProfile | null }> {
  try {
    const [userPersonaResult, userProfileResult] = await Promise.allSettled([
      supabase
        .from('personas')
        .select('*')
        .eq('user_id', userId)
        .limit(1)
        .single(),
      supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .single()
    ]);

    const persona = userPersonaResult.status === 'fulfilled' ? userPersonaResult.value.data : null;
    const profile = userProfileResult.status === 'fulfilled' ? userProfileResult.value.data : null;

    console.log('✅ User data fetched:', {
      hasPersona: !!persona,
      hasProfile: !!profile,
      username: profile?.username
    });

    return { persona, profile };

  } catch (error) {
    console.error('❌ Failed to fetch user data:', error);
    // Don't throw - these are non-critical for context extraction
    return { persona: null, profile: null };
  }
}

/**
 * Get character data optimized for context extraction
 */
export function getCharacterForContext(character: CharacterData) {
  return {
    personality_summary: character.character_definitions?.personality_summary || '',
    description: character.character_definitions?.description || '',
    scenario: character.character_definitions?.scenario || '',
    greeting: character.character_definitions?.greeting || ''
  };
}

/**
 * Create template replacement function
 */
export function createTemplateReplacer(
  persona: UserPersona | null,
  profile: UserProfile | null,
  character: CharacterData
) {
  return (content: string): string => {
    if (!content) return content;
    
    const userName = persona?.name || profile?.username || 'User';
    const charName = character.name || 'Character';
    
    return content
      .replace(/\{\{user\}\}/g, userName)
      .replace(/\{\{char\}\}/g, charName);
  };
}
