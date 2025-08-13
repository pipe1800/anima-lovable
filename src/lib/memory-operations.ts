import { supabase } from '@/integrations/supabase/client';

export async function createMemory(chatId: string, characterId: string) {
  const response = await supabase.functions.invoke('chat-management', {
    body: { operation: 'create-memory', chatId, characterId }
  });
  if (response.error) throw new Error(response.error.message || 'Failed to create memory');
  return response.data;
}
