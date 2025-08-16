import { supabase } from '@/integrations/supabase/client';
import { buildGreetingVariants, pickRandomGreeting } from '@/lib/greeting-utils';

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
  let response: any;
  // Attempt create-with-greeting first (works with or without explicit greeting)
  try {
    response = await supabase.functions.invoke('chat-management', {
      body: {
        operation: 'create-with-greeting',
        charactersData: [{ id: characterId, name: characterName }],
        selectedPersonaId: selectedPersonaId || null,
        ...(greeting ? { greeting } : {}),
      },
    });
  } catch (e) {
    response = { error: e };
  }

  if (response.error || !response.data?.chat_id) {
    // Fallback to basic
    const fallback = await supabase.functions.invoke('chat-management', {
      body: {
        operation: 'create-basic',
        charactersData: [{ id: characterId, name: characterName }],
        selectedPersonaId: selectedPersonaId || null,
      },
    });
    if (fallback.error) throw fallback.error;
    if (!fallback.data?.chat_id) throw new Error('No chat_id returned');
    return { chatId: fallback.data.chat_id, greetingUsed: greeting || null };
  }

  // Try to capture the actual greeting the backend persisted (if it returns it)
  const backendGreeting = response.data?.greeting_used || response.data?.greeting || greeting || null;
  return { chatId: response.data.chat_id, greetingUsed: backendGreeting };
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
export async function createChatWithGreeting(params: CreateChatParams): Promise<{ chat_id: string }> {
  const { chatId } = await createChat(params);
  return { chat_id: chatId };
}
