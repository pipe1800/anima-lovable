import extractAddonContext from '@/data/edge/extractAddonContext';
import { callEdgeFunction } from '@/data/edge/core/client';

// Chat & memory creation (moved from lib/chat-operations & memory-operations for centralization)
export async function createChat(options: { characterId: string; characterName: string; selectedPersonaId?: string | null; greeting?: string | null; }) {
  const { characterId, characterName, selectedPersonaId, greeting } = options;
  const result = await callEdgeFunction<any>('chat-management', { // eslint-disable-line @typescript-eslint/no-explicit-any
    operation: 'create-with-greeting',
    charactersData: [{ id: characterId, name: characterName }],
    selectedPersonaId: selectedPersonaId || null,
    ...(greeting ? { greeting } : {})
  });
  if (!result.ok || !result.data?.chat_id) throw result.error || new Error('Failed to create chat');
  return { chatId: result.data.chat_id as string, greetingUsed: result.data.greeting_used || greeting || null };
}

export async function createMemory(chatId: string, characterId: string) {
  const result = await callEdgeFunction<any>('chat-management', { // eslint-disable-line @typescript-eslint/no-explicit-any
    operation: 'create-memory',
    chatId,
    characterId,
  });
  if (!result.ok) throw result.error || new Error('Failed to create memory');
  return result.data;
}

// Legacy interface retained temporarily if other modules import its shape
export interface ExtractAddonContextPayload {
  chat_id: string;
  character_id?: string | null;
  addon_settings: Record<string, any>;
  mode?: 'initial' | 'update';
}

// Removed deprecated invokeExtractAddonContext; use extractAddonContext directly.
export { extractAddonContext };
export const ChatFunctions = { createChat, createMemory, extractAddonContext };
