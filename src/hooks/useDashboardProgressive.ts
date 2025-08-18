import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { queryKeys } from '@/queries/chatQueries';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook for loading dashboard stats independently
 * This loads first to show the user basic information immediately
 */
export const useDashboardStats = () => {
  const { user, subscription: authSubscription } = useAuth();
  const userId = user?.id;
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['dashboard','stats', userId],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      let credits = qc.getQueryData(queryKeys.user.credits(userId)) as any;
      if (credits === undefined) {
        // Fallback direct lightweight fetch
        const { data, error } = await supabase
          .from('credits')
          .select('balance')
            .eq('user_id', userId)
          .maybeSingle();
        if (!error && data?.balance !== undefined) credits = data.balance; else credits = 0;
      }
      return { credits: credits || 0, subscription: authSubscription, creditsUsed: 0, errors: { credits: null, creditsUsage: null } };
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
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
      try {
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
            chats_count,
            likes_count,
            character_definitions!inner(
              personality_summary,
              scenario
            )
          `)
          .eq('creator_id', userId)
          .order('updated_at', { ascending: false });

        if (charError) {
          console.error('Dashboard characters query failed:', charError);
        }

        const charactersWithCounts = (characters || []).map((character: any) => ({
          ...character,
          chats_count: character?.chats_count ?? 0,
          likes_count: character?.likes_count ?? 0,
          tagline: character?.short_description || '',
          creator: { username: 'You' }
        }));

        // Get favorites
        const { data: favoritesData, error: favError } = await supabase
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
              character_definitions!inner(
                personality_summary,
                scenario
              )
            )
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (favError) {
          console.error('Dashboard favorites query failed:', favError);
        }

        const favoritesWithCounts = (favoritesData || []).map((fav: any) => {
          if (!fav.character) return null;
          const c = fav.character as any;
          return {
            ...c,
            chats_count: c?.chats_count ?? 0,
            likes_count: c?.likes_count ?? 0,
            tagline: c?.short_description || '',
          };
        });

        return { 
          characters: charactersWithCounts,
          favorites: favoritesWithCounts.filter(Boolean)
        };
      } catch (e) {
        console.error('Dashboard characters/favorites load failed:', e);
        return { characters: [], favorites: [] };
      }
    },
    enabled: !!userId,
    staleTime: 1000 * 60, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};
