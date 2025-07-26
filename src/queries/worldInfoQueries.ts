import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/integrations/supabase/types';

type Tag = Tables<'tags'>;
type WorldInfo = Tables<'world_infos'>;

// Get all tags
export function useAllTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Tag[];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Get user's world infos
export function useUserWorldInfos() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['user-world-infos', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('world_infos')
        .select(`
          *,
          world_info_entries(count),
          world_info_likes(count),
          world_info_tags(
            tags(*)
          )
        `)
        .eq('creator_id', user.id)
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      
      return data.map(worldInfo => ({
        ...worldInfo,
        entriesCount: worldInfo.world_info_entries?.[0]?.count || 0,
        likesCount: worldInfo.world_info_likes?.[0]?.count || 0,
        tags: worldInfo.world_info_tags?.map(wt => wt.tags).filter(Boolean) || []
      }));
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Get user's world info collection (favorited)
export function useUserWorldInfoCollection() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['user-world-info-collection', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('world_info_likes')
        .select(`
          world_infos(
            *,
            world_info_entries(count),
            world_info_likes(count),
            profiles!world_infos_creator_id_fkey(username),
            world_info_tags(
              tags(*)
            )
          )
        `)
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      return data
        .map(like => like.world_infos)
        .filter(Boolean)
        .map(worldInfo => ({
          ...worldInfo,
          entriesCount: worldInfo.world_info_entries?.[0]?.count || 0,
          likesCount: worldInfo.world_info_likes?.[0]?.count || 0,
          creatorUsername: worldInfo.profiles?.username,
          tags: worldInfo.world_info_tags?.map(wt => wt.tags).filter(Boolean) || []
        }));
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

// Get specific world info
export function useWorldInfo(id: string) {
  return useQuery({
    queryKey: ['world-info', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('world_infos')
        .select(`
          *,
          profiles!world_infos_creator_id_fkey(username, avatar_url),
          world_info_entries(
            id, keywords, entry_text, created_at
          ),
          world_info_tags(
            tags(*)
          ),
          world_info_likes(count)
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      
      return {
        ...data,
        creator: data.profiles,
        entries: data.world_info_entries || [],
        tags: data.world_info_tags?.map(wt => wt.tags).filter(Boolean) || [],
        likesCount: data.world_info_likes?.[0]?.count || 0
      };
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

// Get world info entries
export function useWorldInfoEntries(worldInfoId: string) {
  return useQuery({
    queryKey: ['world-info-entries', worldInfoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('world_info_entries')
        .select('*')
        .eq('world_info_id', worldInfoId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!worldInfoId,
    staleTime: 5 * 60 * 1000,
  });
}

// Get world info tags
export function useWorldInfoTags(worldInfoId: string) {
  return useQuery({
    queryKey: ['world-info-tags', worldInfoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('world_info_tags')
        .select(`
          tags(*)
        `)
        .eq('world_info_id', worldInfoId);
      
      if (error) throw error;
      return data.map(wt => wt.tags).filter(Boolean);
    },
    enabled: !!worldInfoId,
    staleTime: 5 * 60 * 1000,
  });
}

// Like/unlike world info mutation
export function useWorldInfoLike() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ worldInfoId, liked }: { worldInfoId: string; liked: boolean }) => {
      if (!user) throw new Error('User not authenticated');
      
      if (liked) {
        const { error } = await supabase
          .from('world_info_likes')
          .insert({ world_info_id: worldInfoId, user_id: user.id });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('world_info_likes')
          .delete()
          .eq('world_info_id', worldInfoId)
          .eq('user_id', user.id);
        if (error) throw error;
      }
    },
    onSuccess: (_, { worldInfoId }) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['world-info', worldInfoId] });
      queryClient.invalidateQueries({ queryKey: ['user-world-info-collection'] });
    },
  });
}

// Export queries object for easier consumption
export const useWorldInfoQueries = {
  useAllTags,
  useUserWorldInfos,
  useWorldInfoCollection,
  useWorldInfo,
  useWorldInfoEntries,
  useWorldInfoLike
};
