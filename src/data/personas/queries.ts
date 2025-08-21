import { supabase } from '@/db/client';

export const getUserPersonasForProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('personas')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { data, error };
};

export const getPersonaById = async (personaId: string) => {
  const { data, error } = await supabase
    .from('personas')
    .select('*')
    .eq('id', personaId)
    .maybeSingle();
  return { data, error };
};

export const getFirstPersonaForUser = async (userId: string) => {
  const { data, error } = await supabase
    .from('personas')
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  return { data, error };
};
