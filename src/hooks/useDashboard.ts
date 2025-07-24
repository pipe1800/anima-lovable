import React from 'react';
import { useQuery, useQueryClient, QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { 
  getUserChats,
  getUserChatsPaginated,
  getUserCharacters, 
  getUserCredits, 
  getUserSubscription,
  getMonthlyCreditsUsage,
  getUserFavorites
} from '@/lib/supabase-queries';

export const useDashboardData = () => {
  const { user, subscription: authSubscription } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['dashboard', 'overview', userId],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');

      const [charactersResult, favoritesResult, creditsResult, creditsUsageResult] = await Promise.all([
        getUserCharacters(userId),
        getUserFavorites(userId),
        getUserCredits(userId),
        getMonthlyCreditsUsage(userId)
      ]);

      return {
        characters: charactersResult.data || [],
        favorites: favoritesResult.data || [],
        credits: creditsResult.data?.balance || 0,
        subscription: authSubscription, // Use subscription from AuthContext
        creditsUsed: creditsUsageResult.data?.used || 0,
        errors: {
          characters: charactersResult.error,
          favorites: favoritesResult.error,
          credits: creditsResult.error,
          creditsUsage: creditsUsageResult.error
        }
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

  // Prefetch next page
  React.useEffect(() => {
    if (userId) {
      // Prefetch next page
      queryClient.prefetchQuery({
        queryKey: ['user', 'chats', 'paginated', userId, page + 1, limit],
        queryFn: async () => {
          const result = await getUserChatsPaginated(userId, page + 1, limit);
          if (result.error) throw result.error;
          return result;
        },
        staleTime: 30 * 1000,
      });

      // Prefetch 2 pages ahead for even smoother experience
      queryClient.prefetchQuery({
        queryKey: ['user', 'chats', 'paginated', userId, page + 2, limit],
        queryFn: async () => {
          const result = await getUserChatsPaginated(userId, page + 2, limit);
          if (result.error) throw result.error;
          return result;
        },
        staleTime: 30 * 1000,
      });

      // Also prefetch previous page if we're not on page 1
      if (page > 1) {
        queryClient.prefetchQuery({
          queryKey: ['user', 'chats', 'paginated', userId, page - 1, limit],
          queryFn: async () => {
            const result = await getUserChatsPaginated(userId, page - 1, limit);
            if (result.error) throw result.error;
            return result;
          },
          staleTime: 30 * 1000,
        });
      }
    }
  }, [userId, page, limit, queryClient]);

  return useQuery({
    queryKey: ['user', 'chats', 'paginated', userId, page, limit],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      const result = await getUserChatsPaginated(userId, page, limit);
      if (result.error) throw result.error;
      return result;
    },
    enabled: !!userId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    placeholderData: (previousData) => previousData, // Keeps previous data while loading
  });
};

export const useUserChats = () => {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['user', 'chats', userId],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      const result = await getUserChats(userId);
      if (result.error) throw result.error;
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

export const useUserCredits = () => {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['user', 'credits', userId],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      const result = await getUserCredits(userId);
      if (result.error) throw result.error;
      return result.data?.balance || 0;
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes - credits change more frequently
    gcTime: 10 * 60 * 1000,
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
      const result = await getMonthlyCreditsUsage(userId);
      if (result.error) throw result.error;
      return result.data?.used || 0;
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
      const [charactersResult, favoritesResult, creditsResult, creditsUsageResult] = await Promise.all([
        getUserCharacters(userId),
        getUserFavorites(userId),
        getUserCredits(userId),
        getMonthlyCreditsUsage(userId)
      ]);

      return {
        characters: charactersResult.data || [],
        favorites: favoritesResult.data || [],
        credits: creditsResult.data?.balance || 0,
        subscription: null, // Will use from AuthContext
        creditsUsed: creditsUsageResult.data?.used || 0,
        errors: {
          characters: charactersResult.error,
          favorites: favoritesResult.error,
          credits: creditsResult.error,
          creditsUsage: creditsUsageResult.error
        }
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};