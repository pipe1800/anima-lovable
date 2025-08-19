import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

// Provide second generic param (never) to satisfy TableName generic signature pattern used elsewhere
export type Persona = Tables<'personas', never>;
export type PersonaInsert = TablesInsert<'personas'>;
export type PersonaUpdate = TablesUpdate<'personas'>;

const DEFAULT_AVATAR = '/default_avatar.jpg';

export async function createPersona(persona: Omit<PersonaInsert, 'user_id'>) {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User must be authenticated to create a persona');
  }

  const { data, error } = await supabase
    .from('personas')
    .insert([{
      ...persona,
      avatar_url: (persona as any).avatar_url || DEFAULT_AVATAR,
      user_id: user.id
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getUserPersonas(userId?: string) {
  // Allow explicit userId for efficiency; fallback to auth lookup for backward compatibility
  let effectiveUserId = userId;
  if (!effectiveUserId) {
    const { data: { user } } = await supabase.auth.getUser();
    effectiveUserId = user?.id;
  }
  if (!effectiveUserId) return [];

  const { data, error } = await supabase
    .from('personas')
    .select('id, name, bio, lore, avatar_url, created_at, updated_at, user_id')
    .eq('user_id', effectiveUserId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function updatePersona(id: string, updates: PersonaUpdate) {
  const { data, error } = await supabase
    .from('personas')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePersona(id: string) {
  const { error } = await supabase
    .from('personas')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function getPersonaById(id: string) {
  const { data, error } = await supabase
    .from('personas')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}