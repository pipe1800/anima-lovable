import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Hook for polling chat messages when real-time is unavailable
 * Provides fallback mechanism for message updates
 */
export const useChatPolling = (
  chatId: string | null, 
  isRealtimeConnected: boolean
) => {
  const queryClient = useQueryClient();
  
  useEffect(() => {
    if (!chatId) return;
    
    console.log(`🔄 Starting polling for chat ${chatId} (real-time: ${isRealtimeConnected ? 'connected' : 'disconnected'})`);
    
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ 
        queryKey: ['chat', 'messages', chatId],
        refetchType: 'active'
      });
    }, isRealtimeConnected ? 30000 : 5000); // 30s when connected, 5s when not
    
    return () => {
      console.log(`⏹️ Stopping polling for chat ${chatId}`);
      clearInterval(interval);
    };
  }, [chatId, isRealtimeConnected, queryClient]);
};
