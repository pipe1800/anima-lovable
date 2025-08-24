import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/client';
import { Tags } from '@/data';

const sbAny: any = supabase;

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
  chats_count?: number;
  likes_count?: number;
  favorites_count?: number;
  messages_count?: number;
  tags?: Array<{ id: number; name: string }>;
}

export const useCharacterProfile = (characterId: string | undefined) => {
  return useQuery({
    queryKey: ['character', 'profile', characterId],
    queryFn: async (): Promise<CharacterProfileData> => {
      if (!characterId) throw new Error('Character ID not provided');

      // 1) Core character fields (use any-cast until DB types are regenerated)
      const { data: character, error: characterError } = await sbAny
        .from('characters')
        .select(
          [
            'id',
            'name',
            'short_description',
            'avatar_url',
            'interaction_count',
            'created_at',
            'creator_id',
            'visibility',
            'chats_count',
            'likes_count',
            'favorites_count',
            'messages_count',
          ].join(', ')
        )
        .eq('id', characterId)
        .single();

      if (characterError || !character) {
        throw new Error('Character not found or not public');
      }

      if (character.visibility !== 'public') {
        throw new Error('Character not public');
      }

      // 2) Definitions
      const { data: defs } = await supabase
        .from('character_definitions')
        .select('personality_summary, description, greeting')
        .eq('character_id', characterId)
        .single();

      // 3) Creator profile
      const { data: creator } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', character.creator_id)
        .single();

      // 4) Tags
      const { data: charTags } = await supabase
        .from('character_tags')
        .select('tag_id')
        .eq('character_id', characterId);

      let tags: Array<{ id: number; name: string }> = [];
      const tagIds = (charTags || []).map((t: any) => t.tag_id);
      if (tagIds.length > 0) {
        // Prefer cached list and filter (avoids extra round trip if already cached)
        const { data: allTags } = await Tags.listTags();
        const tagIdSet = new Set(tagIds);
        tags = (Array.isArray(allTags) ? (allTags as any[]) : []).filter(t => tagIdSet.has(t.id)).map(t => ({ id: t.id, name: t.name }));
        // Fallback (if cache empty) fetch direct
        if (!tags.length) {
          const { data: tagRows } = await supabase
            .from('tags')
            .select('id, name')
            .in('id', tagIds);
          tags = (tagRows || []) as Array<{ id: number; name: string }>;
        }
      }

      return {
        id: character.id,
        name: character.name,
        short_description: character.short_description,
        avatar_url: character.avatar_url,
        interaction_count: character.interaction_count,
        created_at: character.created_at,
        creator_id: character.creator_id,
        visibility: character.visibility,
        character_definitions: defs || undefined,
        creator: creator || { username: 'Unknown', avatar_url: null },
        chats_count: character.chats_count ?? 0,
        likes_count: character.likes_count ?? 0,
        favorites_count: character.favorites_count ?? 0,
        messages_count: character.messages_count ?? 0,
        tags,
      } as CharacterProfileData;
    },
    enabled: !!characterId,
    staleTime: 10 * 60 * 1000, // 10 minutes - character profiles don't change frequently
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: (failureCount, error) => {
      const msg = (error as any)?.message || '';
      if (msg.includes('not found') || msg.includes('not public')) return false;
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
    staleTime: 5 * 60 * 1000,
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
        const { error } = await supabase
          .from('character_likes')
          .delete()
          .eq('character_id', characterId)
          .eq('user_id', user.id);
        if (error) throw error;
        return false;
      } else {
        const { error } = await supabase
          .from('character_likes')
          .insert([{ character_id: characterId, user_id: user.id }]);
        if (error) throw error;
        return true;
      }
    },
    onMutate: async ({ characterId, isLiked }) => {
      await queryClient.cancelQueries({ queryKey: ['character', 'like-status', characterId, user?.id] });
      await queryClient.cancelQueries({ queryKey: ['character', 'profile', characterId] });

      const previousLikeStatus = queryClient.getQueryData(['character', 'like-status', characterId, user?.id]);
      const previousProfile = queryClient.getQueryData<CharacterProfileData>(['character', 'profile', characterId]);

      queryClient.setQueryData(['character', 'like-status', characterId, user?.id], !isLiked);

      if (previousProfile) {
        queryClient.setQueryData(['character', 'profile', characterId], {
          ...previousProfile,
          likes_count: isLiked 
            ? Math.max(0, (previousProfile.likes_count || 0) - 1)
            : (previousProfile.likes_count || 0) + 1
        } as CharacterProfileData);
      }

      return { previousLikeStatus, previousProfile } as const;
    },
    onError: (err, { characterId }, context) => {
      if (context?.previousLikeStatus !== undefined) {
        queryClient.setQueryData(['character', 'like-status', characterId, user?.id], context.previousLikeStatus);
      }
      if (context?.previousProfile) {
        queryClient.setQueryData(['character', 'profile', characterId], context.previousProfile);
      }
    },
    onSuccess: (newLikeStatus, { characterId }) => {
      queryClient.setQueryData(['character', 'like-status', characterId, user?.id], newLikeStatus);
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

      const { data, error } = await sbAny
        .from('characters')
        .select('chats_count, likes_count, messages_count, favorites_count')
        .eq('id', characterId)
        .single();

      if (error) throw error;
      return {
        chatCount: data?.chats_count || 0,
        likesCount: data?.likes_count || 0,
        favoritesCount: data?.favorites_count || 0,
        messagesCount: data?.messages_count || 0,
      };
    },
    enabled: !!characterId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
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