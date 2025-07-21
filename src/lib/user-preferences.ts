import { supabase } from '@/integrations/supabase/client';

/**
 * Get the user's last used persona ID from their most recent chat
 */
export async function getUserLastUsedPersona(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('chats')
    .select('selected_persona_id')
    .eq('user_id', userId)
    .not('selected_persona_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    console.log('No last used persona found or error:', error);
    return null;
  }

  return data.selected_persona_id;
}

/**
 * Get the user's default persona from their profile
 */
export async function getUserDefaultPersona(userId: string): Promise<string | null> {
  // First try to get the user's default persona from their profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('default_persona_id')
    .eq('id', userId)
    .single();

  if (!profileError && profile?.default_persona_id) {
    return profile.default_persona_id;
  }

  // Fallback to first created persona if no default is set
  const { data, error } = await supabase
    .from('personas')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.id;
}

/**
 * Get the best persona for a new chat: user's default persona > last used > first created > null
 */
export async function getBestPersonaForNewChat(userId: string): Promise<string | null> {
  // First try to get user's default persona from profile
  const defaultPersona = await getUserDefaultPersona(userId);
  if (defaultPersona) return defaultPersona;

  // Fallback to last used persona
  const lastUsed = await getUserLastUsedPersona(userId);
  if (lastUsed) return lastUsed;

  return null;
}
