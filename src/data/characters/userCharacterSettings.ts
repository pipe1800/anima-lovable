import { supabase } from '@/db/client';

export async function getUserCharacterSettings(userId: string, characterId: string) {
  const { data, error } = await supabase
    .from('user_character_settings')
    .select('*')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .maybeSingle();
  return { data, error };
}

export async function upsertUserCharacterSettings(userId: string, characterId: string, settings: Partial<{ chat_mode: string; time_awareness_enabled: boolean }>) {
  const { data, error } = await supabase
    .from('user_character_settings')
    .upsert({
      user_id: userId,
      character_id: characterId,
      ...settings,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,character_id' })
    .select()
    .single();
  return { data, error };
}