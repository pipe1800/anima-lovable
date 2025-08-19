import React from 'react';
import { useQuery, useQueryClient, QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { 
  getUserChatsPaginated,
} from '@/lib/supabase-queries';
import { queryConfigs, queryKeys } from '@/queries/chatQueries';
import { useBootstrap } from '@/state/bootstrap-store'
import { useFavorites } from '@/state/bootstrap-store'

export const useDashboardData = () => {
  const { user } = useAuth();
  const { credits, subscription, snapshotVersion, characters, charactersVersion, favoritesVersion } = useBootstrap() as any;
  const { favoritesFull } = useFavorites();
  const userId = user?.id;
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['dashboard','overview', userId, snapshotVersion, charactersVersion, favoritesVersion],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      return {
        characters: characters || [],
        favorites: favoritesFull || [],
        credits: credits?.balance || 0,
        subscription,
        creditsUsed: 0,
        errors: { characters: null, favorites: null, credits: null, creditsUsage: null }
      };
    },
    enabled: !!userId, // snapshot must exist
    staleTime: 5 * 60 * 1000, // 5 minutes - keep data fresh longer
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useUserChatsPaginated = (page: number = 1, limit: number = 10, enabled: boolean = true) => {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();

  // Prefetch next/prev pages (unchanged) – but avoid throwing on errors
  React.useEffect(() => {
    if (userId) {
      queryClient.prefetchQuery({
        queryKey: ['user', 'chats', 'paginated', userId, page + 1, limit],
        queryFn: async () => {
          const nextPage = page + 1;
          const result = await getUserChatsPaginated(userId, nextPage, limit);
          if (result.error) {
            console.warn('Prefetch chats failed (next):', result.error);
            return { data: [], totalCount: 0, currentPage: nextPage, totalPages: 0, error: null } as any;
          }
          return result;
        },
        staleTime: 60 * 1000,
      });
      queryClient.prefetchQuery({
        queryKey: ['user', 'chats', 'paginated', userId, page + 2, limit],
        queryFn: async () => {
          const nextNextPage = page + 2;
          const result = await getUserChatsPaginated(userId, nextNextPage, limit);
          if (result.error) {
            console.warn('Prefetch chats failed (+2):', result.error);
            return { data: [], totalCount: 0, currentPage: nextNextPage, totalPages: 0, error: null } as any;
          }
          return result;
        },
        staleTime: 60 * 1000,
      });
      if (page > 1) {
        queryClient.prefetchQuery({
          queryKey: ['user', 'chats', 'paginated', userId, page - 1, limit],
          queryFn: async () => {
            const prevPage = page - 1;
            const result = await getUserChatsPaginated(userId, prevPage, limit);
            if (result.error) {
              console.warn('Prefetch chats failed (prev):', result.error);
              return { data: [], totalCount: 0, currentPage: prevPage, totalPages: 0, error: null } as any;
            }
            return result;
          },
          staleTime: 60 * 1000,
        });
      }
    }
  }, [userId, page, limit, queryClient]);

  return useQuery({
    queryKey: ['user', 'chats', 'paginated', userId, page, limit],
    queryFn: async () => {
      if (!userId) return { data: [], totalCount: 0, currentPage: page, totalPages: 0 } as any;
      // Now uses batched under the hood (deprecated path)
      const result = await getUserChatsPaginated(userId, page, limit);
      if (result.error) {
        console.error('Load chats failed:', result.error);
        return { data: [], totalCount: 0, currentPage: page, totalPages: 0, error: null } as any;
      }
      return result;
    },
    enabled: !!userId && enabled,
    staleTime: 60 * 1000, // keep for a minute
    gcTime: 10 * 60 * 1000,
    placeholderData: (previousData) => previousData, // Keeps previous data while loading
    select: (data) => data,
  });
};

export const useUserChats = () => {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['user', 'chats', userId],
    queryFn: async () => {
      if (!userId) return [] as any[];
      const result = await getUserChatsPaginated(userId, 1, 50);
      if (result.error) {
        console.error('Load chats (non-paginated) failed:', result.error);
        return [] as any[];
      }
      return result.data || [];
    },
    enabled: !!userId,
    staleTime: 3 * 60 * 1000, // 3 minutes
    gcTime: 10 * 60 * 1000,
  });
};

export const useMonthlyCreditsUsage = () => {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['user', 'monthly-credits-usage', userId],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      // Fallback: return 0 until usage endpoint is implemented
      return 0;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
  });
};

// Hook to invalidate dashboard-related queries
export const useDashboardMutations = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;

  const invalidateDashboard = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['user', 'chats'] });
  };

  const invalidateCredits = () => {
    queryClient.invalidateQueries({ queryKey: ['user', 'credits', userId] });
  };

  const invalidateCreditsUsage = () => {
    queryClient.invalidateQueries({ queryKey: ['user', 'monthly-credits-usage', userId] });
  };

  return {
    invalidateDashboard,
    invalidateCredits,
    invalidateCreditsUsage,
  };
};

// Preload function for dashboard data
export const preloadDashboardData = async (userId: string, queryClient: QueryClient) => {
  if (!userId) return;
  return queryClient.prefetchQuery({
    queryKey: ['dashboard', 'overview', userId, null],
    queryFn: async () => ({
      characters: [],
      favorites: [],
      credits: 0,
      subscription: null,
      creditsUsed: 0,
      errors: { characters: null, favorites: null, credits: null, creditsUsage: null }
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};