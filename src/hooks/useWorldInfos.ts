import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { WorldInfo, SearchParams as WorldInfoSearchParams } from '@/data';
import { supabase } from '@/db/client';
import { getUserOwnedWorldInfos, getUserWorldInfoCollection, getWorldInfoWithEntries, getWorldInfoTags } from '@/data/worldInfo/queries';
const sbAny: any = supabase; // temp until world info tables augmented

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
  const { data, error } = await getUserOwnedWorldInfos(userId);
  if (error) throw error;
  return data as any;
};

// Optimized query for user collection
const fetchUserWorldInfoCollection = async (userId: string): Promise<WorldInfoWithDetails[]> => {
  const { data, error } = await getUserWorldInfoCollection(userId);
  if (error) throw error;
  return data as any;
};

export const useUserWorldInfos = () => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['user-world-infos', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      // Get user's own world infos
      const ownWorldInfosPromise = fetchUserWorldInfos(user.id);
      
      // Get user's collected world infos
      const collectionPromise = fetchUserWorldInfoCollection(user.id);
      
      const [ownWorldInfos, collectionWorldInfos] = await Promise.all([
        ownWorldInfosPromise,
        collectionPromise
      ]);
      
      // Combine both lists and remove duplicates
      const allWorldInfos = [...ownWorldInfos, ...collectionWorldInfos];
      const uniqueWorldInfos = allWorldInfos.filter((worldInfo, index, self) => 
        index === self.findIndex(w => w.id === worldInfo.id)
      );
      
      return uniqueWorldInfos;
    },
    enabled: !!user,
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
    queryKey: ['world-info-with-entries', worldInfoId, user?.id],
    queryFn: async () => {
      if (!worldInfoId) throw new Error('Missing required data');
      const { data: worldInfo, error: worldInfoError } = await getWorldInfoWithEntries(worldInfoId);
      if (worldInfoError || !worldInfo) throw new Error('Failed to fetch world info');
      const record: any = worldInfo;
      if (record.visibility === 'private' && (!user || record.creator_id !== user.id)) {
        throw new Error('World info not public');
      }
      return { ...record, entries: record.entries || [] };
    },
    enabled: !!worldInfoId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    retry: (failureCount, error) => {
      const msg = (error as any)?.message || '';
      if (msg.includes('not public')) return false;
      return failureCount < 3;
    }
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
          world_info_entries(id),
          world_info_tags(
            tags(id, name)
          )
        `)
        .eq('visibility', 'public')
        .order('created_at', { ascending: false });
      if (error) throw new Error('Failed to fetch public world infos');

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
};

export const useSearchPublicWorldInfos = (params: WorldInfoSearchParams) => {
  return useQuery({
    queryKey: ['public-world-infos-search', params],
    queryFn: () => WorldInfo.searchPublicWorldInfos(params),
    enabled: false,
    staleTime: 60 * 1000,
    gcTime: 15 * 60 * 1000,
    placeholderData: (prev) => prev ?? undefined,
  });
};

// World info tags query
export const useWorldInfoTags = (worldInfoId: string | null) => {
  return useQuery({
    queryKey: ['world-info-tags', worldInfoId],
    queryFn: async () => {
      if (!worldInfoId) throw new Error('World info ID required');
      
      const { data: tags, error } = await getWorldInfoTags(worldInfoId);
      if (error) throw new Error('Failed to fetch world info tags');
      return tags || [];
    },
    enabled: !!worldInfoId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
};