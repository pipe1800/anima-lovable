import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { WorldInfo, SearchParams as WorldInfoSearchParams } from '@/data';
import { supabase } from '@/db/client';

// Replace legacy fetch helpers with consolidated RPC wrappers
const fetchUserWorldInfos = async (userId: string) => {
  const { data, error } = await WorldInfo.listUserWorldInfos(userId);
  if (error) throw error;
  return data as any[];
};

export const useUserWorldInfos = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['user-world-infos', user?.id],
    queryFn: () => user ? fetchUserWorldInfos(user.id) : Promise.resolve([]),
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
};

export const useUserWorldInfoCollection = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['user-world-info-collection', user?.id],
    queryFn: () => user ? fetchUserWorldInfos(user.id) : Promise.resolve([]),
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
};

export const useWorldInfoWithEntries = (worldInfoId: string | null) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['world-info-with-entries', worldInfoId, user?.id],
    queryFn: async () => {
      if (!worldInfoId) throw new Error('Missing required data');
      const { data, error } = await WorldInfo.fetchWorldInfoFull(worldInfoId);
      if (error) throw error;
      if (!data) throw new Error('Not found');
      if (data.visibility === 'private' && (!user || data.creator_id !== user.id)) throw new Error('World info not public');
      return data;
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

export const usePublicWorldInfos = (params: { search?: string; sort?: 'newest' | 'interactions'; excludeNSFW?: boolean; tagIds?: number[] } = {}) => {
  const { search, sort = 'interactions', excludeNSFW = false, tagIds } = params;
  return useQuery({
    queryKey: ['public-world-infos', params],
    queryFn: async () => {
      const { data } = await WorldInfo.listPublicWorldInfos({ search, sort, excludeNSFW, tagIds });
      return data;
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
};

export const useSearchPublicWorldInfos = (params: WorldInfoSearchParams) => {
  return useQuery({
    queryKey: ['public-world-infos-search', params],
    queryFn: async () => {
      const mapped = {
        search: params.searchQuery,
        sort: params.sortBy === 'newest' ? 'newest' as const : 'interactions' as const,
        excludeNSFW: params.filters.nsfw === false,
        tagIds: (params.filters.tags || []) as any
      };
      const { data, total, hasMore } = await WorldInfo.listPublicWorldInfos({
        search: mapped.search,
        sort: mapped.sort,
        excludeNSFW: mapped.excludeNSFW,
        tagIds: mapped.tagIds?.length ? mapped.tagIds : undefined,
        offset: params.offset,
        limit: params.limit
      });
      return { data, total, hasMore };
    },
    enabled: false,
    staleTime: 60 * 1000,
    gcTime: 15 * 60 * 1000,
    placeholderData: (prev) => prev ?? undefined,
  });
};

export const useWorldInfoTags = (worldInfoId: string | null) => {
  return useQuery({
    queryKey: ['world-info-tags', worldInfoId],
    queryFn: async () => {
      if (!worldInfoId) throw new Error('World info ID required');
      const { data, error } = await WorldInfo.fetchWorldInfoFull(worldInfoId);
      if (error) throw error;
      return data?.tags || [];
    },
    enabled: !!worldInfoId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
};