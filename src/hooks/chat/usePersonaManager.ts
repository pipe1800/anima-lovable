import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUserPersonas, createPersona, deletePersona, type Persona } from '@/lib/persona-operations';
import { getChatSelectedPersona } from '@/lib/chat-persona-operations';
import { getBestPersonaForNewChat } from '@/lib/user-preferences';
import { supabase } from '@/integrations/supabase/client';
import logger from '@/utils/logger';

export const personaKeys = {
  all: (userId?: string) => ['personas', userId] as const,
  chatSelected: (chatId?: string) => ['chat', 'persona', chatId] as const,
};

export function usePersonaManager(userId?: string, chatId?: string) {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [personaToEdit, setPersonaToEdit] = useState<Persona | null>(null);
  const [currentPersonaDraft, setCurrentPersonaDraft] = useState<{ name: string; bio: string; lore: string; avatar_url: string | null }>({
    name: '', bio: '', lore: '', avatar_url: null
  });

  // Personas list
  const personasQuery = useQuery<Persona[]>({
    queryKey: personaKeys.all(userId),
    queryFn: async () => {
      if (!userId) return [];
      return getUserPersonas();
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Selected persona for current chat (or best default for new chat)
  const selectedPersonaQuery = useQuery<Persona | null>({
    queryKey: personaKeys.chatSelected(chatId || 'new'),
    queryFn: async () => {
      if (chatId) {
        const data = await getChatSelectedPersona(chatId);
        return (data.personas as Persona) || null;
      }
      if (!userId) return null;
      const bestPersonaId = await getBestPersonaForNewChat(userId);
      const list = personasQuery.data || [];
      return list.find(p => p.id === bestPersonaId) || null;
    },
    enabled: (!!chatId && !!userId) || (!!userId && personasQuery.status === 'success'),
  });

  const selectedPersona = selectedPersonaQuery.data || null;
  const personas = personasQuery.data || [];

  // Create persona
  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; bio: string | null; lore: string | null; avatar_url: string | null }) => {
      return createPersona(payload);
    },
    onSuccess: (newPersona) => {
      queryClient.setQueryData(personaKeys.all(userId), (old: Persona[] = []) => [newPersona, ...old]);
      setShowCreateModal(false);
      setCurrentPersonaDraft({ name: '', bio: '', lore: '', avatar_url: null });
      logger.info('Persona created', newPersona);
    },
    onError: (err) => logger.error('Error creating persona', err)
  });

  // Delete persona
  const deleteMutation = useMutation({
    mutationFn: async (personaId: string) => deletePersona(personaId),
    onSuccess: (_res, id) => {
      queryClient.setQueryData(personaKeys.all(userId), (old: Persona[] = []) => old.filter(p => p.id !== id));
      if (selectedPersona?.id === id) {
        // Clear or pick another
        const next = (queryClient.getQueryData(personaKeys.all(userId)) as Persona[] | undefined)?.[0] || null;
        queryClient.setQueryData(personaKeys.chatSelected(chatId || 'new'), next);
      }
    }
  });

  const setSelectedPersona = useCallback((persona: Persona | null) => {
    queryClient.setQueryData(personaKeys.chatSelected(chatId || 'new'), persona);
  }, [queryClient, chatId]);

  return {
    personas,
    selectedPersona,
    // modal state
    showCreateModal,
    setShowCreateModal,
    showEditModal,
    setShowEditModal,
    personaToEdit,
    setPersonaToEdit,
    // draft
    currentPersonaDraft,
    setCurrentPersonaDraft,
    // actions
    createPersona: (payload: { name: string; bio: string | null; lore: string | null; avatar_url: string | null }) => createMutation.mutateAsync(payload),
    deletePersona: (id: string) => deleteMutation.mutateAsync(id),
    setSelectedPersona,
  } as const;
}
