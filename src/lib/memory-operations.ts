import { ChatFunctions } from '@/data/chats/functions';

export async function createMemory(chatId: string, characterId: string) {
  return ChatFunctions.createMemory(chatId, characterId);
}
