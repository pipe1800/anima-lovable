/**
 * Character Data Fetching Module
 *
 * Handles fetching character information with fallback logic
 * for the extract-chat-context function
 */

import type {
  Character,
  CharacterDefinition,
  SupabaseClient,
  TemplateContext,
} from '../types/streaming-interfaces.ts';
import { buildTemplateReplacer } from './database.ts';

interface CharacterWorldInfo {
  id: string;
  name?: string | null;
  description?: string | null;
  world_id?: string | null;
  worlds?: {
    id: string;
    name: string;
    description?: string | null;
  } | null;
}

interface CharacterData extends Character {
  personality?: string | null;
  instructions?: string | null;
  example_conversations?: string | null;
  world_info?: CharacterWorldInfo[] | null;
  context_settings?: Record<string, unknown> | null;
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
  supabase: SupabaseClient,
  options?: { full?: boolean },
): Promise<CharacterData> {
  try {
    const full = options?.full === true;
    const baseSelect =
      'id, name, greeting, personality_summary, context_settings, character_definitions(*)';
    const fullExtras =
      ', personality, description, instructions, scenario, example_conversations, world_info:world_infos(id,name,description,world_id,worlds(id,name,description))';
    const selectClause = full ? `${baseSelect}${fullExtras}` : baseSelect;

    const { data: character, error: characterError } = await supabase
      .from<CharacterData>('characters')
      .select(selectClause)
      .eq('id', characterId)
      .single();

    if (character && !characterError) {
      console.log('[character-fetcher] Character data fetched from characters table');
      return character;
    }

    // Fallback: Try character_definitions if not found in characters
    console.log('[character-fetcher] Character missing, checking character_definitions');
    const { data: def, error: defError } = await supabase
      .from<CharacterDefinition>('character_definitions')
      .select('*')
      .eq('character_id', characterId)
      .single();

    if (def && !defError) {
      const fallbackCharacter: CharacterData = {
        id: characterId,
        name: def.name ?? 'Unknown Character',
        personality_summary: def.personality_summary,
        description: def.description ?? undefined,
        scenario: def.scenario ?? undefined,
        greeting: def.greeting ?? undefined,
        character_definitions: def,
      };
      console.log('[character-fetcher] Fallback character loaded from character_definitions');
      return fallbackCharacter;
    }

    console.error('[character-fetcher] Character fetch error:', characterError);
    console.error('[character-fetcher] character_definitions fetch error:', defError);
    throw new Error('Character not found');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[character-fetcher] Failed to fetch character data:', err);
    throw new Error(`Failed to fetch character: ${err.message}`);
  }
}

/**
 * Fetch user persona and profile data in parallel
 */
export async function fetchUserData(
  userId: string,
  supabase: SupabaseClient,
): Promise<{ persona: UserPersona | null; profile: UserProfile | null }> {
  try {
    const [personaResponse, profileResponse] = await Promise.all([
      supabase
        .from<UserPersona>('personas')
        .select('id, name, bio, lore')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from<UserProfile>('profiles')
        .select('id, username')
        .eq('id', userId)
        .maybeSingle(),
    ]);

    const persona = personaResponse.data ?? null;
    const profile = profileResponse.data ?? null;

    console.log('[character-fetcher] User data fetched', {
      hasPersona: Boolean(persona),
      hasProfile: Boolean(profile),
      username: profile?.username,
    });

    return { persona, profile };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[character-fetcher] Failed to fetch user data:', err);
    // Don't throw - these are non-critical for context extraction
    return { persona: null, profile: null };
  }
}

/**
 * Get character data optimized for context extraction
 */
export function getCharacterForContext(character: CharacterData) {
  return {
    personality_summary: character.character_definitions?.personality_summary ?? '',
    description: character.character_definitions?.description ?? '',
    scenario: character.character_definitions?.scenario ?? '',
    greeting: character.character_definitions?.greeting ?? '',
  };
}

/**
 * Create template replacement function
 */
export function createTemplateReplacer(
  persona: UserPersona | null,
  profile: UserProfile | null,
  character: CharacterData,
) {
  const context: TemplateContext = {
    userName: persona?.name ?? profile?.username ?? 'User',
    charName: character.name ?? 'Character',
  };
  return buildTemplateReplacer(context);
}
