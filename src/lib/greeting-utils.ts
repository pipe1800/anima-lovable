// Utility functions for character greeting variant handling
// Centralizes extraction so all entry points (ChatInterface, ChatLayout, etc.) stay consistent.

export interface CharacterDefinitionLike {
  greeting?: string | null;
  personality_summary?: any;
}

export interface CharacterContainerLike {
  character_definitions?: CharacterDefinitionLike | null;
}

/**
 * Extract greeting variants from a character container (characterDetails or character object).
 * - Primary greeting: definition.greeting
 * - Alternate greetings: personality_summary.dialogue.alternate_greetings (array of strings)
 * - Removes empty / duplicate entries, trims whitespace.
 */
export function buildGreetingVariants(source: any): string[] {
  try {
    if (!source) return [];
    const def: CharacterDefinitionLike | null | undefined = source.character_definitions || source.character_definition || null;
    if (!def) return [];
    const primary = def.greeting ? String(def.greeting) : '';
    let alternates: string[] = [];
    if (def.personality_summary) {
      try {
        const parsed = typeof def.personality_summary === 'string'
          ? JSON.parse(def.personality_summary)
          : def.personality_summary;
        const alts = parsed?.dialogue?.alternate_greetings;
        if (Array.isArray(alts)) {
          alternates = alts
            .filter(g => typeof g === 'string' && g.trim().length > 0)
            .map(g => g.trim());
        }
      } catch {
        // ignore JSON parsing errors silently
      }
    }
    const all = [primary, ...alternates].filter(g => g && g.trim().length > 0);
    return Array.from(new Set(all));
  } catch {
    return [];
  }
}

/** Pick a random greeting from variants (returns null if none). */
export function pickRandomGreeting(variants: string[]): string | null {
  if (!variants || variants.length === 0) return null;
  const idx = Math.floor(Math.random() * variants.length);
  return variants[idx] || null;
}
