import { useQuery } from '@tanstack/react-query';
import { useAuth, useBillingCredits } from '@/contexts/AuthContext';
import { getUserDashboardOverview } from '@/data/dashboard/queries';

// Unified dashboard overview hook (RPC) – credits sourced from AuthContext realtime balance
export const useDashboardOverview = () => {
  const { user, subscription: authSubscription, supabase, authReady } = useAuth();
  const { balance: liveCredits } = useBillingCredits();
  const userId = user?.id;

  return useQuery({
    queryKey: ['dashboard', 'overview-rpc', userId],
    // Enable as soon as we know the user id (profile not required). This avoids races where profile delays query start.
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh longer
    gcTime: 15 * 60 * 1000, // 15 minutes - keep in cache longer
    refetchOnWindowFocus: false, // Prevent unnecessary refetches on tab switching
    refetchOnMount: false, // Don't refetch if data is still fresh
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');

      const rpcResult = await getUserDashboardOverview(supabase, userId);
      const rpcData = rpcResult.data || { characters: [], favorites: [], liked_ids: [], counts: { characters: 0, favorites: 0, chats: 0 } };

      const charactersWithCounts = (rpcData.characters || []).map((c: any) => ({
        ...c,
        chats_count: c?.chats_count ?? 0,
        likes_count: c?.likes_count ?? 0,
        tagline: c?.tagline || c?.short_description || '',
        creator: { username: 'You' },
      }));

      const favoritesWithCounts = (rpcData.favorites || []).map((c: any) => ({
        ...c,
        chats_count: c?.chats_count ?? 0,
        likes_count: c?.likes_count ?? 0,
        tagline: c?.tagline || c?.short_description || '',
      }));

      return {
        credits: liveCredits,
        subscription: authSubscription,
        creditsUsed: 0,
        characters: charactersWithCounts,
        favorites: favoritesWithCounts,
        likedCharacterIds: rpcData.liked_ids || [],
        counts: rpcData.counts,
        errors: {
          rpc: rpcResult.error,
        },
      };
    },
  });
};

// TODO: remove legacy exports after all consumers migrated
