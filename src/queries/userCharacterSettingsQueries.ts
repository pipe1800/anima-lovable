import { supabase } from '@/integrations/supabase/client';
import { UserCharacterSettings } from '@/types/database';

export async function getUserCharacterSettings(
  userId: string,
  characterId: string
): Promise<UserCharacterSettings | null> {
  const { data, error } = await supabase
    .from('user_character_settings')
    .select('*')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .single();

  if (error && error.code !== 'PGRST116') { // Not found error
    console.error('Error fetching user character settings:', error);
    return null;
  }

  return data as UserCharacterSettings | null;
}

export async function upsertUserCharacterSettings(
  userId: string,
  characterId: string,
  settings: Partial<Pick<UserCharacterSettings, 'chat_mode' | 'time_awareness_enabled'>>
): Promise<UserCharacterSettings | null> {
  const { data, error } = await supabase
    .from('user_character_settings')
    .upsert({
      user_id: userId,
      character_id: characterId,
      ...settings,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,character_id'
    })
    .select()
    .single();

  if (error) {
    console.error('Error upserting user character settings:', error);
    return null;
  }

  return data as UserCharacterSettings | null;
}
