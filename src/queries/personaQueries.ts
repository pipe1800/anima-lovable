import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const personaKeys = {
  all: ['personas'] as const,
  byId: (id: string) => ['personas','id', id] as const,
  firstForUser: (userId: string) => ['personas','first', userId] as const,
};

export interface PersonaRecord {
  id: string;
  name: string;
  avatar_url?: string | null;
  user_id: string;
  created_at: string;
  updated_at?: string;
}

export const usePersonaById = (personaId: string | null | undefined) => {
  return useQuery({
    queryKey: personaId ? personaKeys.byId(personaId) : ['personas','id','none'],
    enabled: !!personaId,
    queryFn: async (): Promise<PersonaRecord | null> => {
      if (!personaId) return null;
      const { data, error } = await supabase
        .from('personas')
        .select('*')
        .eq('id', personaId)
        .maybeSingle();
      if (error) throw error;
      return data as PersonaRecord | null;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
};

// Fetch first persona for current user (used where we only need one for defaults)
export const useFirstPersona = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: user?.id ? personaKeys.firstForUser(user.id) : ['personas','first','none'],
    enabled: !!user?.id,
    queryFn: async (): Promise<PersonaRecord | null> => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('personas')
        .select('*')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (error && (error as any).code !== 'PGRST116') throw error;
      return data || null;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
};
