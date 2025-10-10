import type { Json } from '@/integrations/supabase/types';
import { supabase } from '@/db/client';

interface CharacterDefinitionProjection {
  personality_summary: string | null;
  scenario: Json | null;
}

interface UserCharacterRow {
  id: string;
  name: string;
  short_description: string | null;
  tagline: string | null;
  avatar_url: string | null;
  visibility: 'public' | 'unlisted' | 'private';
  interaction_count: number | null;
  created_at: string;
  updated_at: string | null;
  likes_count: number | null;
  chats_count: number | null;
  character_definitions: CharacterDefinitionProjection | null;
}

export type UserCharacterWithComputedTagline = Omit<UserCharacterRow, 'likes_count' | 'chats_count' | 'tagline'> & {
  likes_count: number;
  chats_count: number;
  tagline: string;
};

type RawCharacterDefinition = CharacterDefinitionProjection | CharacterDefinitionProjection[] | null;

type RawUserCharacterRow = Omit<UserCharacterRow, 'character_definitions'> & {
  character_definitions: RawCharacterDefinition;
};

const normalizeCharacterDefinition = (
  definitions: RawCharacterDefinition,
): CharacterDefinitionProjection | null => {
  if (!definitions) return null;
  if (Array.isArray(definitions)) {
    return definitions[0] ?? null;
  }
  return definitions;
};

const extractTitleFromSummary = (summary: string | null): string | null => {
  if (!summary) return null;
  try {
    const parsed = JSON.parse(summary) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const title = (parsed as { title?: unknown }).title;
      return typeof title === 'string' ? title : null;
    }
  } catch {
    return null;
  }
  return null;
};

const extractTitleFromScenario = (scenario: Json | null): string | null => {
  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) return null;
  const title = (scenario as { title?: unknown }).title;
  return typeof title === 'string' ? title : null;
};

export const getUserCharacters = async (
  userId: string,
): Promise<{ data: UserCharacterWithComputedTagline[]; error: unknown }> => {
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

  if (error) {
    return { data: [], error };
  }

  if (!data) {
    return { data: [], error: null };
  }

  const rows = (data as unknown as RawUserCharacterRow[]).map((row) => ({
    ...row,
    character_definitions: normalizeCharacterDefinition(row.character_definitions),
  })) as UserCharacterRow[];

  const charactersWithCounts: UserCharacterWithComputedTagline[] = rows.map((character) => {
    const definitions = character.character_definitions;
    const summaryTitle = extractTitleFromSummary(definitions?.personality_summary ?? null);
    const scenarioTitle = extractTitleFromScenario(definitions?.scenario ?? null);
    const computedTagline = summaryTitle ?? scenarioTitle ?? character.short_description ?? '';

    return {
      ...character,
      likes_count: character.likes_count ?? 0,
      chats_count: character.chats_count ?? 0,
      tagline: computedTagline,
    };
  });

  return { data: charactersWithCounts, error: null };
};
