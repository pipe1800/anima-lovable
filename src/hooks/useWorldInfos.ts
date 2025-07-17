import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export interface WorldInfoWithDetails {
  id: string;
  name: string;
  short_description: string | null;
  visibility: string;
  creator_id: string;
  created_at: string;
  updated_at: string;
  interaction_count: number;
  entriesCount: number;
  likesCount: number;
  tags: Array<{ id: number; name: string }>;
  creator?: {
    username: string;
    avatar_url?: string;
  };
}

// Optimized query to get user world infos with all related data in one go
const fetchUserWorldInfos = async (userId: string): Promise<WorldInfoWithDetails[]> => {
  // Single optimized query with joins to get all data at once
  const { data: worldInfosWithCounts, error } = await supabase
    .from('world_infos')
    .select(`
      *,
      world_info_entries(count),
      world_info_likes(count),
      world_info_tags(
        tags(id, name)
      )
    `)
    .eq('creator_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching world infos:', error);
    throw new Error('Failed to fetch world infos');
  }

  // Transform the data to match expected format
  return (worldInfosWithCounts || []).map(worldInfo => ({
    ...worldInfo,
    entriesCount: worldInfo.world_info_entries?.length || 0,
    likesCount: worldInfo.world_info_likes?.length || 0,
    tags: worldInfo.world_info_tags?.map(wt => wt.tags).filter(Boolean) || []
  }));
};

// Optimized query for user collection
const fetchUserWorldInfoCollection = async (userId: string): Promise<WorldInfoWithDetails[]> => {
  const { data: collectionData, error } = await supabase
    .from('world_info_users')
    .select(`
      world_infos(
        *,
        world_info_entries(count),
        world_info_likes(count),
        world_info_tags(
          tags(id, name)
        )
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user collection:', error);
    throw new Error('Failed to fetch user collection');
  }

  // Get creator profiles separately
  const worldInfos = (collectionData || [])
    .map(item => item.world_infos)
    .filter(Boolean);

  if (worldInfos.length === 0) return [];

  const creatorIds = [...new Set(worldInfos.map(w => w.creator_id))];
  const { data: creators } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', creatorIds);

  const creatorsMap = new Map(creators?.map(c => [c.id, c]) || []);

  return worldInfos.map(worldInfo => ({
    ...worldInfo,
    entriesCount: worldInfo.world_info_entries?.length || 0,
    likesCount: worldInfo.world_info_likes?.length || 0,
    tags: worldInfo.world_info_tags?.map(wt => wt.tags).filter(Boolean) || [],
    creator: creatorsMap.get(worldInfo.creator_id)
  }));
};

export const useUserWorldInfos = () => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['user-world-infos', user?.id],
    queryFn: () => fetchUserWorldInfos(user!.id),
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
};

export const useUserWorldInfoCollection = () => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['user-world-info-collection', user?.id],
    queryFn: () => fetchUserWorldInfoCollection(user!.id),
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
};

// Single world info with entries
export const useWorldInfoWithEntries = (worldInfoId: string | null) => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['world-info-with-entries', worldInfoId],
    queryFn: async () => {
      if (!worldInfoId || !user) throw new Error('Missing required data');
      
      const { data: worldInfo, error: worldInfoError } = await supabase
        .from('world_infos')
        .select(`
          *,
          world_info_entries(*)
        `)
        .eq('id', worldInfoId)
        .single();

      if (worldInfoError || !worldInfo) {
        throw new Error('Failed to fetch world info');
      }

      return {
        ...worldInfo,
        entries: worldInfo.world_info_entries || []
      };
    },
    enabled: !!worldInfoId && !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
};

// Tags query
export const useAllTags = () => {
  return useQuery({
    queryKey: ['all-tags'],
    queryFn: async () => {
      const { data: tags, error } = await supabase
        .from('tags')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        throw new Error('Failed to fetch tags');
      }

      return tags || [];
    },
    staleTime: 1000 * 60 * 15, // 15 minutes (tags rarely change)
    gcTime: 1000 * 60 * 30, // 30 minutes
  });
};

// Public world infos query
export const usePublicWorldInfos = () => {
  return useQuery({
    queryKey: ['public-world-infos'],
    queryFn: async () => {
      const { data: worldInfos, error } = await supabase
        .from('world_infos')
        .select(`
          *,
          world_info_likes(count),
          world_info_favorites(count)
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
        likes_count: worldInfo.world_info_likes?.length || 0,
        favorites_count: worldInfo.world_info_favorites?.length || 0,
        usage_count: worldInfo.interaction_count
      }));
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
};

// World info tags query
export const useWorldInfoTags = (worldInfoId: string | null) => {
  return useQuery({
    queryKey: ['world-info-tags', worldInfoId],
    queryFn: async () => {
      if (!worldInfoId) throw new Error('World info ID required');
      
      const { data: worldInfoTags, error } = await supabase
        .from('world_info_tags')
        .select(`
          tags(id, name)
        `)
        .eq('world_info_id', worldInfoId);

      if (error) {
        throw new Error('Failed to fetch world info tags');
      }

      return worldInfoTags?.map(wt => wt.tags).filter(Boolean) || [];
    },
    enabled: !!worldInfoId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
};