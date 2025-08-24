import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createPersona, deletePersona, type Persona } from '@/data/personas/mutations';
import { Personas } from '@/data';
import logger from '@/utils/logger';

export const personaKeys = {
  context: (userId?: string, chatId?: string | null, includeList?: boolean) => ['personas','context', userId, chatId, includeList] as const,
};

interface UsePersonaManagerOptions {
  userId?: string;
  chatId?: string;
}

export function usePersonaManager(userId?: string, chatId?: string) {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [personaToEdit, setPersonaToEdit] = useState<Persona | null>(null);
  const [currentPersonaDraft, setCurrentPersonaDraft] = useState<{ name: string; bio: string; lore: string; avatar_url: string | null }>({
    name: '', bio: '', lore: '', avatar_url: null
  });

  // Read persona context (should be pre-fetched by outer component via usePersonaContext, but fallback to cache)
  const ctx = (queryClient.getQueryData(personaKeys.context(userId, chatId || null, true)) as any) || null;
  const personas: Persona[] = ctx?.personas || [];
  const selectedPersona: Persona | null = ctx?.chat_selected_persona || (ctx && ctx.default_persona_id ? personas.find(p => p.id === ctx.default_persona_id) : null) || null;

  // Create persona
  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; bio: string | null; lore: string | null; avatar_url: string | null }) => createPersona(payload),
    onSuccess: (newPersona) => {
      // Optimistically update context cache
      queryClient.setQueryData(personaKeys.context(userId, chatId || null, true), (old: any) => {
        if (!old) return old;
        return { ...old, personas: [newPersona, ...(old.personas || [])] };
      });
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
      queryClient.setQueryData(personaKeys.context(userId, chatId || null, true), (old: any) => {
        if (!old) return old;
        const filtered = (old.personas || []).filter((p: Persona) => p.id !== id);
        return { ...old, personas: filtered, chat_selected_persona: old.chat_selected_persona?.id === id ? null : old.chat_selected_persona };
      });
    }
  });

  const setSelectedPersona = useCallback((persona: Persona | null) => {
    queryClient.setQueryData(personaKeys.context(userId, chatId || null, true), (old: any) => {
      if (!old) return old;
      return { ...old, chat_selected_persona: persona };
    });
  }, [queryClient, userId, chatId]);

  return {
    personas,
    selectedPersona,
    showCreateModal,
    setShowCreateModal,
    showEditModal,
    setShowEditModal,
    personaToEdit,
    setPersonaToEdit,
    currentPersonaDraft,
    setCurrentPersonaDraft,
    createPersona: (payload: { name: string; bio: string | null; lore: string | null; avatar_url: string | null }) => createMutation.mutateAsync(payload),
    deletePersona: (id: string) => deleteMutation.mutateAsync(id),
    setSelectedPersona,
  } as const;
}
