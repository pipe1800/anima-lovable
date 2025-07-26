import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { 
  getUserCredits, 
  getMonthlyCreditsUsage,
  getUserCharacters,
  getUserFavorites
} from '@/lib/supabase-queries';
import { supabase } from '@/integrations/supabase/client';

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
      if (!userId) return { characters: [], favorites: [] };
      
      // Get user's own characters with proper counts
      const { data: characters, error: charError } = await supabase
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
          character_definitions!inner(
            personality_summary,
            scenario
          )
        `)
        .eq('creator_id', userId)
        .order('updated_at', { ascending: false });

      if (charError) throw charError;

      // Get actual chat counts and likes for each character
      const charactersWithCounts = await Promise.all(
        (characters || []).map(async (character) => {
          const [chatCountResult, likesCountResult] = await Promise.all([
            supabase
              .from('chats')
              .select('id', { count: 'exact', head: true })
              .eq('character_id', character.id),
            supabase
              .from('character_likes')
              .select('id', { count: 'exact', head: true })
              .eq('character_id', character.id)
          ]);

          return {
            ...character,
            actual_chat_count: chatCountResult.count || 0,
            likes_count: likesCountResult.count || 0,
            tagline: character.short_description || '',
            creator: { username: 'You' } // Since these are user's own characters
          };
        })
      );

      // Get favorites
      const { data: favoritesData, error: favError } = await supabase
        .from('character_favorites')
        .select(`
          character:characters(
            id,
            name,
            short_description,
            avatar_url,
            interaction_count,
            created_at,
            creator_id,
            character_definitions!inner(
              personality_summary,
              scenario
            )
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (favError) throw favError;

      // Get counts for favorite characters
      const favoritesWithCounts = await Promise.all(
        (favoritesData || []).map(async (fav) => {
          if (!fav.character) return null;
          
          const [chatCountResult, likesCountResult, creatorResult] = await Promise.all([
            supabase
              .from('chats')
              .select('id', { count: 'exact', head: true })
              .eq('character_id', fav.character.id),
            supabase
              .from('character_likes')
              .select('id', { count: 'exact', head: true })
              .eq('character_id', fav.character.id),
            supabase
              .from('profiles')
              .select('username')
              .eq('id', fav.character.creator_id)
              .single()
          ]);

          return {
            ...fav.character,
            actual_chat_count: chatCountResult.count || 0,
            likes_count: likesCountResult.count || 0,
            tagline: fav.character.short_description || '',
            creator: creatorResult.data || { username: 'Unknown' }
          };
        })
      );

      return { 
        characters: charactersWithCounts,
        favorites: favoritesWithCounts.filter(Boolean)
      };
    },
    enabled: !!userId,
    staleTime: 1000 * 60, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};
