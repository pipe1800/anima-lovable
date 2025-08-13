import { supabase } from '@/integrations/supabase/client';

export interface CreateChatParams {
  characterId: string;
  characterName: string;
  selectedPersonaId?: string | null;
}

export async function createChatWithGreeting({ characterId, characterName, selectedPersonaId }: CreateChatParams): Promise<{ chat_id: string }> {
  const response = await supabase.functions.invoke('chat-management', {
    body: {
      operation: 'create-with-greeting',
      charactersData: [{ id: characterId, name: characterName }],
      selectedPersonaId: selectedPersonaId || null,
    },
  });
  if (response.error) throw response.error;
  if (!response.data?.chat_id) throw new Error('No chat_id returned');
  return { chat_id: response.data.chat_id };
}
