import { SUPABASE_API_URL, supabase } from '@/db/client';
import { parseCharacterCardEdge, ParseCharacterCardOptions, ParsedCharacterCard } from '@/data/edge';

/**
 * @deprecated Use parseCharacterCardEdge from '@/data/edge'. This wrapper remains for backward compatibility.
 */
export async function parseCharacterCard(file: File, opts: ParseCharacterCardOptions = {}): Promise<ParsedCharacterCard> {
  return parseCharacterCardEdge(file, opts);
}
