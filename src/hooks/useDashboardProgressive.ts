import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { 
  getUserCredits, 
  getMonthlyCreditsUsage,
  getUserCharacters,
  getUserFavorites
} from '@/lib/supabase-queries';

/**
 * Hook for loading dashboard stats independently
 * This loads first to show the user basic information immediately
 */
export const useDashboardStats = () => {
  const { user, subscription: authSubscription } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['dashboard', 'stats', userId],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');

      const [creditsResult, creditsUsageResult] = await Promise.all([
        getUserCredits(userId),
        getMonthlyCreditsUsage(userId)
      ]);

      return {
        credits: creditsResult.data?.balance || 0,
        subscription: authSubscription,
        creditsUsed: creditsUsageResult.data?.used || 0,
        errors: {
          credits: creditsResult.error,
          creditsUsage: creditsUsageResult.error
        }
      };
    },
    enabled: !!userId,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

/**
 * Hook for loading dashboard characters independently
 * This loads after stats to show user's characters and favorites
 */
export const useDashboardCharacters = () => {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['dashboard', 'characters', userId],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');

      const [charactersResult, favoritesResult] = await Promise.all([
        getUserCharacters(userId),
        getUserFavorites(userId)
      ]);

      return {
        characters: charactersResult.data || [],
        favorites: favoritesResult.data || [],
        errors: {
          characters: charactersResult.error,
          favorites: favoritesResult.error
        }
      };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};
