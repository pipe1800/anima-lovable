import { useQuery } from '@tanstack/react-query';
import { Personas } from '@/data';
import { useAuth } from '@/contexts/AuthContext';

export const personaKeys = {
  all: ['personas'] as const,
  byId: (id: string) => ['personas','id', id] as const,
  firstForUser: (userId: string) => ['personas','first', userId] as const,
};

export const usePersonaById = (personaId: string | null | undefined) => useQuery({
  queryKey: personaId ? personaKeys.byId(personaId) : ['personas','id','none'],
  enabled: !!personaId,
  queryFn: async () => {
    if (!personaId) return null;
    const { data, error } = await Personas.getPersonaById(personaId);
    if (error) throw error;
    return data;
  },
  staleTime: 10 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
});

export const useFirstPersona = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: user?.id ? personaKeys.firstForUser(user.id) : ['personas','first','none'],
    enabled: !!user?.id,
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await Personas.getFirstPersonaForUser(user.id);
      if (error && (error as any).code !== 'PGRST116') throw error;
      return data || null;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
};