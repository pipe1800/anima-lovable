import { useEffect, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import logger from '@/utils/logger';
import { WorldInfoSelection } from '@/data';

export const worldInfoKeys = {
  selection: (userId?: string, characterId?: string) => ['world-info', 'selection', userId, characterId] as const,
};

export function useWorldInfoSelection(
  userId?: string,
  characterId?: string,
  onChange?: (worldInfoId: string | null) => void
) {
  const queryClient = useQueryClient();
  const [selectedWorldInfoId, setSelectedWorldInfoId] = useState<string | null>(null);

  // Load saved selection
  const { data, isLoading, error } = useQuery({
    queryKey: worldInfoKeys.selection(userId, characterId),
    queryFn: async () => {
      if (!userId || !characterId) return { worldInfoId: null } as { worldInfoId: string | null };
      const result = await WorldInfoSelection.getUserCharacterWorldInfo(userId, characterId);
      return result;
    },
    enabled: !!userId && !!characterId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (data) {
      setSelectedWorldInfoId(data.worldInfoId || null);
      onChange?.(data.worldInfoId || null);
    }
  }, [data, onChange]);

  // Save selection
  const saveMutation = useMutation({
    mutationFn: async (worldInfoId: string | null) => {
      if (!userId || !characterId) throw new Error('Missing user or character');
      if (worldInfoId) return WorldInfoSelection.saveUserCharacterWorldInfo(userId, characterId, worldInfoId);
      return WorldInfoSelection.removeUserCharacterWorldInfo(userId, characterId);
    },
    onSuccess: (_res, worldInfoId) => {
      setSelectedWorldInfoId(worldInfoId);
      onChange?.(worldInfoId);
      queryClient.invalidateQueries({ queryKey: worldInfoKeys.selection(userId, characterId) });
      logger.info('World info selection saved', { characterId, userId, worldInfoId });
    },
    onError: (err) => logger.error('Error saving world info selection', err)
  });

  const selectWorldInfo = useCallback((worldInfo: { id: string; name: string } | null) => {
    saveMutation.mutate(worldInfo?.id || null);
  }, [saveMutation]);

  return {
    selectedWorldInfoId,
    isLoading,
    error,
    selectWorldInfo,
  } as const;
}
