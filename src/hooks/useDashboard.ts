import React from 'react';
import { useQuery, useQueryClient, QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { 
  getUserChatsPaginated,
  getUserCharacters, 
  getUserCredits, 
  getUserSubscription,
  // getMonthlyCreditsUsage, // removed: not available, we'll fallback to 0
  getUserFavorites
} from '@/lib/supabase-queries';
import { queryConfigs, queryKeys } from '@/queries/chatQueries';

export const useDashboardData = () => {
  const { user, subscription: authSubscription } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['dashboard', 'overview', userId],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');

      const [charactersResult, favoritesResult] = await Promise.all([
        getUserCharacters(userId),
        getUserFavorites(userId)
      ]);
      const qc = useQueryClient();
      const cachedCredits = qc.getQueryData(queryKeys.user.credits(userId));
      return {
        characters: charactersResult.data || [],
        favorites: favoritesResult.data || [],
        credits: (cachedCredits as any) ?? 0,
        subscription: authSubscription,
        creditsUsed: 0,
        errors: { characters: charactersResult.error, favorites: favoritesResult.error, credits: null, creditsUsage: null }
      };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes - keep data fresh longer
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useUserChatsPaginated = (page: number = 1, limit: number = 10) => {
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
    enabled: !!userId,
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

export const useUserCharacters = () => {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['user', 'characters', userId],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      const result = await getUserCharacters(userId);
      if (result.error) throw result.error;
      return result.data || [];
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000,
  });
};

export const useUserSubscription = () => {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['user', 'subscription', userId],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      const result = await getUserSubscription(userId);
      if (result.error) throw result.error;
      return result.data;
    },
    enabled: !!userId,
    staleTime: 15 * 60 * 1000, // 15 minutes - subscriptions change rarely
    gcTime: 30 * 60 * 1000,
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

export const useUserFavorites = () => {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['user', 'favorites', userId],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      const result = await getUserFavorites(userId);
      if (result.error) throw result.error;
      return result.data || [];
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000,
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
    queryClient.invalidateQueries({ queryKey: ['user', 'characters'] });
    queryClient.invalidateQueries({ queryKey: ['user', 'favorites'] });
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
  
  // Prefetch all dashboard data in the background
  return queryClient.prefetchQuery({
    queryKey: ['dashboard', 'overview', userId],
    queryFn: async () => {
      const [charactersResult, favoritesResult, creditsResult] = await Promise.all([
        getUserCharacters(userId),
        getUserFavorites(userId),
        getUserCredits(userId)
      ]);

      return {
        characters: charactersResult.data || [],
        favorites: favoritesResult.data || [],
        credits: creditsResult.data?.balance || 0,
        subscription: null, // Will use from AuthContext
        creditsUsed: 0, // fallback until usage endpoint implemented
        errors: {
          characters: charactersResult.error,
          favorites: favoritesResult.error,
          credits: creditsResult.error,
          creditsUsage: null
        }
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};