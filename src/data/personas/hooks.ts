import { useQuery } from '@tanstack/react-query';
import { Personas } from '@/data';
import { useAuth } from '@/contexts/AuthContext';

export const personaKeys = {
  all: (userId?: string) => ['personas','list', userId] as const,
  byId: (id: string) => ['personas','id', id] as const,
  context: (userId?: string, chatId?: string | null, includeList?: boolean) => ['personas','context', userId, chatId, includeList] as const,
};

export const usePersonaById = (personaId: string | null | undefined) => useQuery({
  queryKey: personaId ? personaKeys.byId(personaId) : ['personas','id','none'],
  enabled: !!personaId,
  queryFn: async () => {
    if (!personaId) return null;
    return Personas.getPersona(personaId);
  },
  staleTime: 10 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
});

// New unified context hook (replaces useFirstPersona + multiple preference queries)
export const usePersonaContext = (chatId?: string | null, includeList: boolean = true) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: personaKeys.context(user?.id, chatId || null, includeList),
    enabled: !!user?.id,
    queryFn: async () => {
      if (!user?.id) return null;
      return Personas.getPersonaContext({ userId: user.id, chatId: chatId || null, includeList });
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
};