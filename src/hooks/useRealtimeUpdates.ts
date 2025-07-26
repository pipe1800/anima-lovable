import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

export function useRealtimeUpdates(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

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
          console.log('Chat update received:', payload);
          // Invalidate queries to refetch fresh data
          queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
          queryClient.invalidateQueries({ queryKey: ['user-chats'] });
          queryClient.invalidateQueries({ queryKey: ['user-chats-paginated'] });
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
          console.log('Credit update received:', payload);
          queryClient.invalidateQueries({ queryKey: ['user-credits'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
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
          filter: `created_by=eq.${userId}`
        },
        (payload) => {
          console.log('Character update received:', payload);
          queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
          queryClient.invalidateQueries({ queryKey: ['user-characters'] });
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
          console.log('Subscription update received:', payload);
          queryClient.invalidateQueries({ queryKey: ['user-subscription'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
        }
      )
      .subscribe();

    return () => {
      chatSubscription.unsubscribe();
      creditSubscription.unsubscribe();
      characterSubscription.unsubscribe();
      subscriptionUpdates.unsubscribe();
    };
  }, [userId, queryClient]);
}
