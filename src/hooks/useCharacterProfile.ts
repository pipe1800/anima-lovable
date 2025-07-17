import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface CharacterProfileData {
  id: string;
  name: string;
  short_description: string | null;
  avatar_url: string | null;
  interaction_count: number;
  created_at: string;
  creator_id: string;
  visibility: string;
  character_definitions?: {
    personality_summary: string;
    description: string | null;
    greeting: string | null;
  };
  creator?: {
    username: string;
    avatar_url: string | null;
  };
  actual_chat_count?: number;
  likes_count?: number;
  tags?: Array<{ id: number; name: string }>;
}

export const useCharacterProfile = (characterId: string | undefined) => {
  return useQuery({
    queryKey: ['character', 'profile', characterId],
    queryFn: async (): Promise<CharacterProfileData> => {
      if (!characterId) throw new Error('Character ID not provided');

      // Single optimized query with all character data
      const { data: characterData, error: characterError } = await supabase
        .from('characters')
        .select(`
          *,
          character_definitions(*),
          character_tags(tag_id, tags(id, name))
        `)
        .eq('id', characterId)
        .eq('visibility', 'public')
        .single();

      if (characterError) {
        throw new Error('Character not found or not public');
      }

      // Get additional data in parallel
      const [creatorResult, chatCountResult, likesCountResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('username, avatar_url')
          .eq('id', characterData.creator_id)
          .single(),
        supabase
          .from('chats')
          .select('*', { count: 'exact' })
          .eq('character_id', characterId),
        supabase
          .from('character_likes')
          .select('*', { count: 'exact' })
          .eq('character_id', characterId)
      ]);

      return {
        ...characterData,
        creator: creatorResult.data || { username: 'Unknown', avatar_url: null },
        actual_chat_count: chatCountResult.count || 0,
        likes_count: likesCountResult.count || 0,
        tags: characterData.character_tags?.map((ct: any) => ct.tags).filter(Boolean) || []
      };
    },
    enabled: !!characterId,
    staleTime: 10 * 60 * 1000, // 10 minutes - character profiles don't change frequently
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: (failureCount, error) => {
      // Don't retry if character not found
      if (error?.message?.includes('not found')) return false;
      return failureCount < 3;
    },
  });
};

export const useCharacterLikeStatus = (characterId: string | undefined) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['character', 'like-status', characterId, user?.id],
    queryFn: async () => {
      if (!user || !characterId) return false;
      
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

export const useToggleCharacterLike = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
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
    onMutate: async ({ characterId, isLiked }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['character', 'like-status', characterId, user?.id] });
      await queryClient.cancelQueries({ queryKey: ['character', 'profile', characterId] });

      // Snapshot previous values
      const previousLikeStatus = queryClient.getQueryData(['character', 'like-status', characterId, user?.id]);
      const previousProfile = queryClient.getQueryData<CharacterProfileData>(['character', 'profile', characterId]);

      // Optimistically update like status
      queryClient.setQueryData(['character', 'like-status', characterId, user?.id], !isLiked);

      // Optimistically update likes count in profile
      if (previousProfile) {
        queryClient.setQueryData(['character', 'profile', characterId], {
          ...previousProfile,
          likes_count: isLiked 
            ? Math.max(0, (previousProfile.likes_count || 0) - 1)
            : (previousProfile.likes_count || 0) + 1
        });
      }

      return { previousLikeStatus, previousProfile };
    },
    onError: (err, { characterId }, context) => {
      // Revert optimistic updates on error
      if (context?.previousLikeStatus !== undefined) {
        queryClient.setQueryData(['character', 'like-status', characterId, user?.id], context.previousLikeStatus);
      }
      if (context?.previousProfile) {
        queryClient.setQueryData(['character', 'profile', characterId], context.previousProfile);
      }
    },
    onSuccess: (newLikeStatus, { characterId }) => {
      // Update cache with final values
      queryClient.setQueryData(['character', 'like-status', characterId, user?.id], newLikeStatus);

      // Invalidate related queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['characters', 'public'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'favorites'] });
    },
  });
};

// Hook to get character stats efficiently
export const useCharacterStats = (characterId: string | undefined) => {
  return useQuery({
    queryKey: ['character', 'stats', characterId],
    queryFn: async () => {
      if (!characterId) throw new Error('Character ID not provided');

      const [chatCountResult, likesCountResult] = await Promise.all([
        supabase
          .from('chats')
          .select('*', { count: 'exact' })
          .eq('character_id', characterId),
        supabase
          .from('character_likes')
          .select('*', { count: 'exact' })
          .eq('character_id', characterId)
      ]);

      return {
        chatCount: chatCountResult.count || 0,
        likesCount: likesCountResult.count || 0
      };
    },
    enabled: !!characterId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000,
  });
};

// Hook to invalidate character profile related queries
export const useCharacterProfileMutations = () => {
  const queryClient = useQueryClient();

  const invalidateCharacterProfile = (characterId: string) => {
    queryClient.invalidateQueries({ queryKey: ['character', 'profile', characterId] });
    queryClient.invalidateQueries({ queryKey: ['character', 'stats', characterId] });
  };

  const invalidateCharacterLikes = (characterId: string) => {
    queryClient.invalidateQueries({ queryKey: ['character', 'like-status', characterId] });
    queryClient.invalidateQueries({ queryKey: ['character', 'stats', characterId] });
  };

  return {
    invalidateCharacterProfile,
    invalidateCharacterLikes,
  };
};