import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useNSFW } from '@/contexts/NSFWContext';
import { Characters, SearchParams as CharacterSearchParams, CharacterInteractions } from '@/data';
// TODO: Move like/favorite inline queries to Characters or CharacterInteractions data modules.

export const usePublicCharacters = (limit = 50, offset = 0) => {
  const { nsfwEnabled } = useNSFW();
  
  return useQuery({
    queryKey: ['characters', 'public', { limit, offset, nsfwEnabled }],
    queryFn: async () => {
      const result = await Characters.getPublicCharacters(limit, offset, nsfwEnabled);
      if (result.error) throw result.error;
      return result.data || [];
    },
    staleTime: 60 * 1000, // 1 minute for discovery freshness
    gcTime: 15 * 60 * 1000, // 15 minutes
    placeholderData: (prev) => prev ?? [],
  });
};

export const useSearchPublicCharacters = (params: CharacterSearchParams) => {
  return useQuery({
    queryKey: ['public-characters-search', params],
    queryFn: () => Characters.searchPublicCharacters(params),
    enabled: false, // Manual execution only
    staleTime: 60 * 1000, // fresher search cache
    gcTime: 15 * 60 * 1000,
    placeholderData: (prev) => prev ?? undefined,
  });
};

export const useCharacterLike = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const useCheckLikeStatus = (characterId?: string) =>
    useQuery({
      queryKey: ['character', 'like-status', characterId, user?.id],
      queryFn: async () => {
        if (!user || !characterId) return false;
        return CharacterInteractions.isCharacterLiked(characterId, user.id);
      },
      enabled: !!user && !!characterId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000,
    });

  const toggleLike = useMutation({
    mutationFn: async ({ characterId }: { characterId: string; isLiked: boolean }) => {
      if (!user) throw new Error('User not authenticated');
      return CharacterInteractions.toggleCharacterLike(characterId, user.id);
    },
    onSuccess: (newLikeStatus, { characterId }) => {
      // Update like status cache
      queryClient.setQueryData(
        ['character', 'like-status', characterId, user?.id],
        newLikeStatus
      );

      // Invalidate character profile data to update likes count
      queryClient.invalidateQueries({
        queryKey: ['character', 'profile', characterId]
      });

      // Invalidate public characters to update likes count in grids
      queryClient.invalidateQueries({
        queryKey: ['characters', 'public']
      });
    },
  });

  return {
    checkLikeStatus: useCheckLikeStatus,
    useCheckLikeStatus,
    toggleLike,
  };
};

export const useCharacterFavorite = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const useCheckFavoriteStatus = (characterId?: string) =>
    useQuery({
      queryKey: ['character', 'favorite-status', characterId, user?.id],
      queryFn: async () => {
        if (!user || !characterId) return false;
        return CharacterInteractions.isCharacterFavorited(characterId, user.id);
      },
      enabled: !!user && !!characterId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000,
    });

  const toggleFavorite = useMutation({
    mutationFn: async ({ characterId }: { characterId: string; isFavorited: boolean }) => {
      if (!user) throw new Error('User not authenticated');
      return CharacterInteractions.toggleCharacterFavorite(characterId, user.id);
    },
    onSuccess: (newFavoriteStatus, { characterId }) => {
      // Update favorite status cache
      queryClient.setQueryData(
        ['character', 'favorite-status', characterId, user?.id],
        newFavoriteStatus
      );

      // Invalidate user favorites to update dashboard
      queryClient.invalidateQueries({
        queryKey: ['user', 'favorites', user?.id]
      });

      // Invalidate dashboard data
      queryClient.invalidateQueries({
        queryKey: ['dashboard']
      });
    },
  });

  return {
    checkFavoriteStatus: useCheckFavoriteStatus,
    useCheckFavoriteStatus,
    toggleFavorite,
  };
};

// Hook to invalidate character-related queries
export const useCharacterMutations = () => {
  const queryClient = useQueryClient();

  const invalidatePublicCharacters = () => {
    queryClient.invalidateQueries({ queryKey: ['characters', 'public'] });
  };

  const invalidateCharacterProfile = (characterId: string) => {
    queryClient.invalidateQueries({ queryKey: ['character', 'profile', characterId] });
  };

  const invalidateUserCharacters = (userId: string) => {
    queryClient.invalidateQueries({ queryKey: ['user', 'characters', userId] });
  };

  return {
    invalidatePublicCharacters,
    invalidateCharacterProfile,
    invalidateUserCharacters,
  };
};