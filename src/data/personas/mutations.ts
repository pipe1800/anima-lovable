import { supabase } from '@/db/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { Auth } from '@/data';

export type Persona = Tables<'personas', never>;
export type PersonaInsert = TablesInsert<'personas'>;
export type PersonaUpdate = TablesUpdate<'personas'>;

const DEFAULT_AVATAR = '/default_avatar.jpg';

export async function createPersona(persona: Omit<PersonaInsert, 'user_id'>) {
  const userId = await Auth.requireAuthId();
  const { data, error } = await supabase
    .from('personas')
    .insert([{ ...persona, avatar_url: (persona as any).avatar_url || DEFAULT_AVATAR, user_id: userId }])
    .select()
    .single();
  if (error) throw error;
  return data as Persona;
}

export async function getUserPersonas(userId?: string) {
  const effectiveUserId = userId || await (async () => {
    const { user } = await Auth.getAuthUser();
    return user?.id;
  })();
  if (!effectiveUserId) return [] as Persona[];
  const { data, error } = await supabase
    .from('personas')
    .select('id, name, bio, lore, avatar_url, created_at, updated_at, user_id')
    .eq('user_id', effectiveUserId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Persona[];
}

export async function updatePersona(id: string, updates: PersonaUpdate) {
  const { data, error } = await supabase
    .from('personas')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Persona;
}

export async function deletePersona(id: string) {
  const { error } = await supabase.from('personas').delete().eq('id', id);
  if (error) throw error;
}
