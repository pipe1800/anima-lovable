import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { WorldInfo, SearchParams as WorldInfoSearchParams } from '@/data';
import type { WorldInfoFullResult } from '@/data/worldInfo/queries';
import type { WorldInfoSummaryItem, WorldInfoTag } from '@/types/world-info';

// Replace legacy fetch helpers with consolidated RPC wrappers
const fetchUserWorldInfos = async (userId: string): Promise<WorldInfoSummaryItem[]> => {
  const { data, error } = await WorldInfo.listUserWorldInfos(userId);
  if (error) throw error;
  return data;
};

export const useUserWorldInfos = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['user-world-infos', user?.id],
    queryFn: () => (user ? fetchUserWorldInfos(user.id) : Promise.resolve([] as WorldInfoSummaryItem[])),
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
};

export const useUserWorldInfoCollection = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['user-world-info-collection', user?.id],
    queryFn: () => (user ? fetchUserWorldInfos(user.id) : Promise.resolve([] as WorldInfoSummaryItem[])),
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
      return data as WorldInfoFullResult;
    },
    enabled: !!worldInfoId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    retry: (failureCount, error) => {
      const maybeError = error as { message?: string } | null;
      const msg = maybeError?.message ?? '';
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
      return data as WorldInfoSummaryItem[];
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
};

export const useSearchPublicWorldInfos = (params: WorldInfoSearchParams) => {
  return useQuery({
    queryKey: ['public-world-infos-search', params],
    queryFn: async () => {
      const rawTagIds = (params.filters.tags ?? []).map(tag => Number(tag)).filter((value): value is number => Number.isFinite(value));
      const mapped = {
        search: params.searchQuery,
        sort: params.sortBy === 'newest' ? ('newest' as const) : ('interactions' as const),
        excludeNSFW: params.filters.nsfw === false,
        tagIds: rawTagIds.length ? rawTagIds : undefined,
      };
      const { data, total, hasMore } = await WorldInfo.listPublicWorldInfos({
        search: mapped.search,
        sort: mapped.sort,
        excludeNSFW: mapped.excludeNSFW,
        tagIds: mapped.tagIds,
        offset: params.offset,
        limit: params.limit
      });
      return { data: data as WorldInfoSummaryItem[], total, hasMore };
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
      return (data?.tags || []) as WorldInfoTag[];
    },
    enabled: !!worldInfoId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
};