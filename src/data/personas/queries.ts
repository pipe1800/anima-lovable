import { supabase } from '@/db/client';
import type { Tables } from '@/integrations/supabase/types';

export type Persona = Tables<'personas', never>;

// Core field projection used across persona views
const PERSONA_COLUMNS = 'id, user_id, name, bio, lore, avatar_url, created_at, updated_at';

export async function listUserPersonas(userId: string) {
  const { data, error } = await supabase
    .from('personas')
    .select(PERSONA_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Persona[];
}

export async function getPersona(personaId: string) {
  const { data, error } = await supabase
    .from('personas')
    .select(PERSONA_COLUMNS)
    .eq('id', personaId)
    .maybeSingle();
  if (error) throw error;
  return data as Persona | null;
}

// RPC: get_user_persona_context
export interface PersonaContextResult {
  default_persona_id: string | null;
  last_used_persona_id: string | null;
  first_persona_id: string | null;
  chat_selected_persona: Pick<Persona, 'id' | 'name' | 'bio' | 'lore' | 'avatar_url'> | null;
  personas: Persona[] | null; // null when not requested
}

export async function getPersonaContext(params: { userId: string; chatId?: string | null; includeList?: boolean }) {
  const { userId, chatId, includeList } = params;
  const { data, error } = await (supabase as any).rpc('get_user_persona_context', {
    p_user_id: userId,
    p_chat_id: chatId || null,
    p_include_list: includeList || false,
  });
  if (error) throw error;
  return data as PersonaContextResult;
}
