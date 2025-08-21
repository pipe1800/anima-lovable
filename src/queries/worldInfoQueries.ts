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
          world_info_entries(id),
          world_info_tags(
            tags(*)
          )
        `)
        .eq('creator_id', user.id)
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      
      return data.map(worldInfo => ({
        ...worldInfo,
        entriesCount: worldInfo.world_info_entries?.length || 0,
        likesCount: worldInfo.likes_count || 0,
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
        .from('world_info_user_likes')
        .select(`
          world_infos(
            *,
            world_info_entries(count),
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
          likesCount: worldInfo.likes_count || 0,
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
          world_info_entries(
            id, keywords, entry_text, created_at
          ),
          world_info_tags(
            tags(*)
          )
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      
      return {
        ...data,
        entries: data.world_info_entries || [],
        tags: data.world_info_tags?.map(wt => wt.tags).filter(Boolean) || [],
        likesCount: data.likes_count || 0
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

// Get public world infos
export function usePublicWorldInfos() {
  return useQuery({
    queryKey: ['public-world-infos'],
    queryFn: async () => {
      const { data: worldInfos, error } = await supabase
        .from('world_infos')
        .select(`
          *,
          world_info_entries(id),
          world_info_tags(
            tags(id, name)
          )
        `)
        .eq('visibility', 'public')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error('Failed to fetch public world infos');
      }

      if (!worldInfos || worldInfos.length === 0) return [];

      // Get creator profiles separately
      const creatorIds = [...new Set(worldInfos.map(w => w.creator_id))];
      const { data: creators } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', creatorIds);

      const creatorsMap = new Map(creators?.map(c => [c.id, c]) || []);

      return worldInfos.map(worldInfo => ({
        ...worldInfo,
        creator: creatorsMap.get(worldInfo.creator_id),
        entriesCount: worldInfo.world_info_entries?.length || 0,
        likesCount: worldInfo.likes_count || 0,
        tags: worldInfo.world_info_tags?.map(wt => wt.tags).filter(Boolean) || [],
        usage_count: worldInfo.interaction_count
      }));
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
}

// Like/unlike world info mutation
export function useWorldInfoLike() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    // Accept just the worldInfoId; backend RPC handles toggle & returns new state
    mutationFn: async (worldInfoId: string) => {
      if (!user) throw new Error('User not authenticated');
      const { data, error } = await supabase.rpc('toggle_world_info_like', { p_world_info_id: worldInfoId });
      if (error) throw error;
      return { worldInfoId, result: data } as { worldInfoId: string; result: { liked: boolean; likes_count: number } };
    },
    onSuccess: ({ worldInfoId, result }) => {
      // Optimistically update any cached world-info detail
      queryClient.setQueryData<any>(['world-info', worldInfoId], (old) => {
        if (!old) return old;
        return { ...old, likesCount: result.likes_count };
      });
      // Invalidate broader collections to stay consistent
      queryClient.invalidateQueries({ queryKey: ['world-info', worldInfoId] });
      queryClient.invalidateQueries({ queryKey: ['user-world-info-collection'] });
      queryClient.invalidateQueries({ queryKey: ['public-world-infos'] });
    },
  });
}

// Export queries object for easier consumption
export const useWorldInfoQueries = {
  useAllTags,
  useUserWorldInfos,
  useUserWorldInfoCollection,
  useWorldInfo,
  useWorldInfoEntries,
  usePublicWorldInfos,
  useWorldInfoLike
};
