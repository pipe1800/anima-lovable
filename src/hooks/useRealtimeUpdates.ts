import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import logger from '@/utils/logger';

export function useRealtimeUpdates(userId: string | undefined) {
  const queryClient = useQueryClient();
  const log = logger.scoped('RealtimeUpdates');

  useEffect(() => {
    if (!userId) return;

    // Helper to invalidate dashboard-related queries consistently
    const invalidateDashboardQueries = () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats', userId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'characters', userId] });
      queryClient.invalidateQueries({ queryKey: ['user', 'chats'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'chats', 'paginated'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'credits', userId] });
    };

    // Subscribe to chat updates
    const chatSubscription = supabase
      .channel(`user-chats-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chats',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          log.debug('Chat update received:', payload);
          invalidateDashboardQueries();
        }
      )
      .subscribe();

    // Subscribe to credit updates
    const creditSubscription = supabase
      .channel(`user-credits-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_credits',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          log.debug('Credit update received:', payload);
          invalidateDashboardQueries();
        }
      )
      .subscribe();

    // Subscribe to character updates
    const characterSubscription = supabase
      .channel(`user-characters-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'characters',
          filter: `creator_id=eq.${userId}`
        },
        (payload) => {
          log.debug('Character update received:', payload);
          invalidateDashboardQueries();
        }
      )
      .subscribe();

    // Subscribe to subscription updates
    const subscriptionUpdates = supabase
      .channel(`user-subscription-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_subscriptions',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          log.debug('Subscription update received:', payload);
          invalidateDashboardQueries();
        }
      )
      .subscribe();

    return () => {
      chatSubscription.unsubscribe();
      creditSubscription.unsubscribe();
      characterSubscription.unsubscribe();
      subscriptionUpdates.unsubscribe();
    };
  }, [userId, queryClient, log]);
}
