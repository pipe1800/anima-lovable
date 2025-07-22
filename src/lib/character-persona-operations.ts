import { supabase } from '@/integrations/supabase/client';

/**
 * Update the user's default persona ID in their profile
 * This ensures that all future chats will use this persona by default
 */
export async function updateUserDefaultPersona(
  userId: string,
  personaId: string | null
): Promise<void> {
  console.log('🎭 Updating user default persona:', { userId, personaId });
  
  const { error } = await supabase
    .from('profiles')
    .update({ default_persona_id: personaId })
    .eq('id', userId);

  if (error) {
    console.error('Error updating user default persona:', error);
    throw error;
  }

}
