import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tags } from '@/data';

// Central tag hooks (shared across app)
// Provides react-query layer atop in-memory cached tags module

export const TAGS_QUERY_KEY = ['tags','all'];

export function useAllTags(options: { namesOnly?: boolean; enabled?: boolean } = {}) {
  const { namesOnly = false, enabled = true } = options;
  return useQuery({
    queryKey: [...TAGS_QUERY_KEY, namesOnly ? 'names' : 'full'],
    queryFn: async () => {
      const { data, error } = await Tags.listTags({ namesOnly });
      if (error) throw error;
      return data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useInvalidateTags() {
  const qc = useQueryClient();
  return () => {
    Tags.invalidateTagCache();
    qc.invalidateQueries({ queryKey: TAGS_QUERY_KEY });
  };
}
