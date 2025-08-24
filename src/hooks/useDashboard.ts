import React from 'react';
import { useQuery, useQueryClient, QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Billing, Chats } from '@/data';
import { CharacterUser as CharacterUserSettings } from '@/data';

export const useUserChatsPaginated = (page: number = 1, limit: number = 10) => {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!userId) return;
    // Prefetch only the next page IF current page likely full (optimistic: assume full until fetched result says otherwise via queryClient)
    const key = ['user', 'chats', 'paginated', userId, page, limit];
    const current = queryClient.getQueryData<any>(key);
    const canPrefetch = !current || (Array.isArray(current.data) && current.data.length === limit);
    if (canPrefetch) {
      queryClient.prefetchQuery({
        queryKey: ['user', 'chats', 'paginated', userId, page + 1, limit],
        queryFn: async () => {
          const nextPage = page + 1;
          const result = await Chats.getUserChatsPaginated(userId, nextPage, limit);
          if (result.error) return { data: [], totalCount: 0, currentPage: nextPage, totalPages: 0, error: null } as any;
          return result;
        },
        staleTime: 60 * 1000,
      });
    }
  }, [userId, page, limit, queryClient]);

  return useQuery({
    queryKey: ['user', 'chats', 'paginated', userId, page, limit],
    queryFn: async () => {
      if (!userId) return { data: [], totalCount: 0, currentPage: page, totalPages: 0 } as any;
      const result = await Chats.getUserChatsPaginated(userId, page, limit);
      if (result.error) return { data: [], totalCount: 0, currentPage: page, totalPages: 0, error: null } as any;
      return result;
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: (previousData) => previousData,
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
      const result = await Chats.getUserChatsPaginated(userId, 1, 50);
      if (result.error) return [] as any[];
      return result.data || [];
    },
    enabled: !!userId,
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

// Helper to preload dashboard data still retained for potential SSR (characters and favorites) – can be reworked to RPC later if needed
export const preloadDashboardData = async (userId: string, queryClient: QueryClient) => {
  if (!userId) return;
  return queryClient.prefetchQuery({
    queryKey: ['dashboard', 'overview-rpc', userId],
    queryFn: async () => ({ characters: [], favorites: [], credits: 0, subscription: null, creditsUsed: 0, counts: { characters: 0, favorites: 0, chats: 0 } }),
    staleTime: 5 * 60 * 1000,
  });
};