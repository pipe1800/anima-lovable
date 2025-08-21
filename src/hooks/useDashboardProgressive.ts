import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getUserCredits } from '@/lib/supabase-queries';

// Combined single query hook to reduce duplicate network calls.
export const useDashboardData = () => {
  const { user, subscription: authSubscription, supabase } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['dashboard', 'combined', userId],
    enabled: !!userId,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');

      // Parallel queries: credits, own characters, favorites
      const [creditsResult, charactersQuery, favoritesQuery] = await Promise.all([
        getUserCredits(supabase, userId),
        supabase
          .from('characters')
          .select(`
            id,
            name,
            short_description,
            avatar_url,
            visibility,
            interaction_count,
            created_at,
            updated_at,
            creator_id,
            chats_count,
            likes_count,
            character_definitions!inner(personality_summary, scenario)
          `)
          .eq('creator_id', userId)
          .order('updated_at', { ascending: false }),
        supabase
          .from('character_favorites')
          .select(`
            character:characters(
              id,
              name,
              short_description,
              avatar_url,
              visibility,
              interaction_count,
              created_at,
              creator_id,
              chats_count,
              likes_count,
              character_definitions!inner(personality_summary, scenario)
            )
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      ]);

      const { data: characters, error: charError } = charactersQuery;
      const { data: favoritesData, error: favError } = favoritesQuery;

      if (charError) console.warn('Dashboard characters query failed:', charError);
      if (favError) console.warn('Dashboard favorites query failed:', favError);

      const charactersWithCounts = (characters || []).map((c: any) => ({
        ...c,
        chats_count: c?.chats_count ?? 0,
        likes_count: c?.likes_count ?? 0,
        tagline: c?.short_description || '',
        creator: { username: 'You' }
      }));

      const favoritesWithCounts = (favoritesData || [])
        .map((fav: any) => {
          const c = fav.character as any;
          if (!c) return null;
            return {
              ...c,
              chats_count: c?.chats_count ?? 0,
              likes_count: c?.likes_count ?? 0,
              tagline: c?.short_description || ''
            };
        })
        .filter(Boolean);

      // Batch liked status for all dashboard characters (avoid N like-status queries)
      const allIds = [
        ...charactersWithCounts.map(c => c.id),
        ...favoritesWithCounts.map((c: any) => c.id)
      ];
      const uniqueIds = Array.from(new Set(allIds));
      let likedCharacterIds: string[] = [];
      if (uniqueIds.length) {
        const { data: likesRows } = await supabase
          .from('character_likes')
          .select('character_id')
          .eq('user_id', userId)
          .in('character_id', uniqueIds);
        likedCharacterIds = (likesRows || []).map(r => (r as any).character_id);
      }

      return {
        credits: creditsResult.data?.balance || 0,
        subscription: authSubscription,
        creditsUsed: 0, // Placeholder for future usage metrics
        characters: charactersWithCounts,
        favorites: favoritesWithCounts,
        likedCharacterIds,
        errors: {
          credits: creditsResult.error,
          characters: charError,
          favorites: favError
        }
      };
    }
  });
};
