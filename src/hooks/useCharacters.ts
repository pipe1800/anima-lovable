import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getPublicCharacters } from '@/lib/supabase-queries';
import { supabase } from '@/integrations/supabase/client';

export const usePublicCharacters = (limit = 50, offset = 0) => {
  return useQuery({
    queryKey: ['characters', 'public', { limit, offset }],
    queryFn: async () => {
      const result = await getPublicCharacters(limit, offset);
      if (result.error) throw result.error;
      return result.data || [];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - public characters don't change frequently
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
};

export const useCharacterLike = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const checkLikeStatus = (characterId: string) => {
    return useQuery({
      queryKey: ['character', 'like-status', characterId, user?.id],
      queryFn: async () => {
        if (!user) return false;
        
        const { data } = await supabase
          .from('character_likes')
          .select('id')
          .eq('character_id', characterId)
          .eq('user_id', user.id)
          .single();
        
        return !!data;
      },
      enabled: !!user && !!characterId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000,
    });
  };

  const toggleLike = useMutation({
    mutationFn: async ({ characterId, isLiked }: { characterId: string; isLiked: boolean }) => {
      if (!user) throw new Error('User not authenticated');

      if (isLiked) {
        // Remove like
        const { error } = await supabase
          .from('character_likes')
          .delete()
          .eq('character_id', characterId)
          .eq('user_id', user.id);
        
        if (error) throw error;
        return false;
      } else {
        // Add like
        const { error } = await supabase
          .from('character_likes')
          .insert([{ character_id: characterId, user_id: user.id }]);
        
        if (error) throw error;
        return true;
      }
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
    checkLikeStatus,
    toggleLike,
  };
};

export const useCharacterFavorite = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const checkFavoriteStatus = (characterId: string) => {
    return useQuery({
      queryKey: ['character', 'favorite-status', characterId, user?.id],
      queryFn: async () => {
        if (!user) return false;
        
        const { data } = await supabase
          .from('character_favorites')
          .select('id')
          .eq('character_id', characterId)
          .eq('user_id', user.id)
          .single();
        
        return !!data;
      },
      enabled: !!user && !!characterId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000,
    });
  };

  const toggleFavorite = useMutation({
    mutationFn: async ({ characterId, isFavorited }: { characterId: string; isFavorited: boolean }) => {
      if (!user) throw new Error('User not authenticated');

      if (isFavorited) {
        // Remove favorite
        const { error } = await supabase
          .from('character_favorites')
          .delete()
          .eq('character_id', characterId)
          .eq('user_id', user.id);
        
        if (error) throw error;
        return false;
      } else {
        // Add favorite
        const { error } = await supabase
          .from('character_favorites')
          .insert([{ character_id: characterId, user_id: user.id }]);
        
        if (error) throw error;
        return true;
      }
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
    checkFavoriteStatus,
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