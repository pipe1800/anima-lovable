import { callEdgeFunction } from '@/data/edge/core/client';

/**
 * Triggers latent profile extraction for a character (fire-and-forget semantics on caller side).
 * Wrapped in data layer so UI/hooks don't invoke edge functions directly.
 */
export async function extractLatentProfile(characterId: string) {
  if (!characterId) return { ok: false, error: new Error('Missing characterId') };
  try {
    const result = await callEdgeFunction<any>('extract-latent-profile', { // eslint-disable-line @typescript-eslint/no-explicit-any
      character_id: characterId,
    });
    return result;
  } catch (error) {
    return { ok: false, error } as const;
  }
}

export const CharacterFunctions = { extractLatentProfile };

export default CharacterFunctions;
