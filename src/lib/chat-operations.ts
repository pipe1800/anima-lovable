import { supabase } from '@/db/client';
import { buildGreetingVariants, pickRandomGreeting } from '@/lib/greeting-utils';
import { ChatFunctions } from '@/data/chats/functions';

/**
 * Centralized greeting variant extractor (wraps buildGreetingVariants so callers can import from one file)
 */
export function getGreetingVariants(source: any): string[] {
  return buildGreetingVariants(source);
}

export interface CreateChatInput {
  characterId: string;
  characterName: string;
  selectedPersonaId?: string | null;
  greeting?: string | null;
}

export interface CreateChatResult {
  chatId: string;
  greetingUsed: string | null;
}

/**
 * Unified chat creation.
 * Tries create-with-greeting (even if greeting omitted – backend will pick) then falls back to create-basic.
 */
export async function createChat({ characterId, characterName, selectedPersonaId, greeting }: CreateChatInput): Promise<CreateChatResult> {
  const { chatId, greetingUsed } = await ChatFunctions.createChat({ characterId, characterName, selectedPersonaId, greeting });
  return { chatId, greetingUsed };
}

export interface CreateChatParams {
  characterId: string;
  characterName: string;
  selectedPersonaId?: string | null;
  greeting?: string | null; // optional explicit greeting variant
}

/**
 * @deprecated Use createChat instead. Provided for backward compatibility (returns legacy shape).
 */
export async function createChatWithGreeting(params: CreateChatParams): Promise<{ chat_id: string }> { const { chatId } = await createChat(params); return { chat_id: chatId }; }
