import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useNSFW } from '@/contexts/NSFWContext';
import { getPublicCharacters, searchPublicCharacters, SearchParams } from '@/lib/supabase-queries';
import { supabase } from '@/integrations/supabase/client';

export const usePublicCharacters = (limit = 50, offset = 0, enabled: boolean = true) => {
  const { nsfwEnabled } = useNSFW();
  
  return useQuery({
    queryKey: ['characters', 'public', { limit, offset, nsfwEnabled }],
    queryFn: async () => {
      const result = await getPublicCharacters(limit, offset, nsfwEnabled);
      if (result.error) throw result.error;
      return result.data || [];
    },
    enabled,
    staleTime: 60 * 1000, // 1 minute for discovery freshness
    gcTime: 15 * 60 * 1000, // 15 minutes
    placeholderData: (prev) => prev ?? [],
  });
};

export const useSearchPublicCharacters = (params: SearchParams) => {
  return useQuery({
    queryKey: ['public-characters-search', params],
    queryFn: () => searchPublicCharacters(params),
    enabled: false, // Manual execution only
    staleTime: 60 * 1000, // fresher search cache
    gcTime: 15 * 60 * 1000,
    placeholderData: (prev) => prev ?? undefined,
  });
};

export const useUserCharacterEngagementSets = (userId?: string) => {
  const enabled = !!userId;
  const likesQuery = useQuery({
    queryKey: ['user','likes','characterIds', userId],
    queryFn: async () => {
      if (!userId) return new Set<string>();
      const { data, error } = await supabase
        .from('character_likes')
        .select('character_id')
        .eq('user_id', userId);
      if (error) throw error;
      return new Set((data||[]).map(r=>r.character_id as string));
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const favoritesQuery = useQuery({
    queryKey: ['user','favorites','characterIds', userId],
    queryFn: async () => {
      if (!userId) return new Set<string>();
      const { data, error } = await supabase
        .from('character_favorites')
        .select('character_id')
        .eq('user_id', userId);
      if (error) throw error;
      return new Set((data||[]).map(r=>r.character_id as string));
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  return { likesSet: likesQuery.data, favoritesSet: favoritesQuery.data, likesQuery, favoritesQuery };
};

export const useCharacterLike = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const engagement = useUserCharacterEngagementSets(user?.id);
  const checkLikeStatus = (characterId: string) => ({
    data: !!engagement.likesSet?.has(characterId),
    isLoading: engagement.likesQuery.isLoading,
    refetch: engagement.likesQuery.refetch,
  });
  const toggleLike = useMutation({
    mutationFn: async ({ characterId, isLiked }: { characterId: string; isLiked: boolean }) => {
      if (!user) throw new Error('User not authenticated');
      if (isLiked) {
        const { error } = await supabase
          .from('character_likes')
          .delete()
          .eq('character_id', characterId)
          .eq('user_id', user.id);
        if (error) throw error; return false;
      } else {
        const { error } = await supabase
          .from('character_likes')
          .insert([{ character_id: characterId, user_id: user.id }]);
        if (error) throw error; return true;
      }
    },
    onSuccess: (newStatus, { characterId }) => {
      queryClient.setQueryData(['user','likes','characterIds', user?.id], (prev: Set<string> | undefined) => {
        const next = new Set(prev || []);
        if (newStatus) next.add(characterId); else next.delete(characterId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['characters','public'] });
    },
  });
  return { checkLikeStatus, toggleLike };
};

export const useCharacterFavorite = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const engagement = useUserCharacterEngagementSets(user?.id);
  const checkFavoriteStatus = (characterId: string) => ({
    data: !!engagement.favoritesSet?.has(characterId),
    isLoading: engagement.favoritesQuery.isLoading,
    refetch: engagement.favoritesQuery.refetch,
  });
  const toggleFavorite = useMutation({
    mutationFn: async ({ characterId, isFavorited }: { characterId: string; isFavorited: boolean }) => {
      if (!user) throw new Error('User not authenticated');
      if (isFavorited) {
        const { error } = await supabase
          .from('character_favorites')
          .delete()
          .eq('character_id', characterId)
          .eq('user_id', user.id);
        if (error) throw error; return false;
      } else {
        const { error } = await supabase
          .from('character_favorites')
          .insert([{ character_id: characterId, user_id: user.id }]);
        if (error) throw error; return true;
      }
    },
    onSuccess: (newStatus, { characterId }) => {
      queryClient.setQueryData(['user','favorites','characterIds', user?.id], (prev: Set<string> | undefined) => {
        const next = new Set(prev || []);
        if (newStatus) next.add(characterId); else next.delete(characterId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['characters','public'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  return { checkFavoriteStatus, toggleFavorite };
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