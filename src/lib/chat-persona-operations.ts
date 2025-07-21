import { supabase } from '@/integrations/supabase/client';

/**
 * Update the selected persona for a specific chat
 */
export async function updateChatSelectedPersona(chatId: string, personaId: string | null) {
  const { data, error } = await supabase
    .from('chats')
    .update({ 
      selected_persona_id: personaId,
      updated_at: new Date().toISOString()
    })
    .eq('id', chatId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get the selected persona for a specific chat
 */
export async function getChatSelectedPersona(chatId: string) {
  const { data, error } = await supabase
    .from('chats')
    .select(`
      selected_persona_id,
      personas:selected_persona_id(
        id,
        name,
        bio,
        lore,
        avatar_url
      )
    `)
    .eq('id', chatId)
    .single();

  if (error) throw error;
  return data;
}
