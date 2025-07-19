import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { ChatAction } from '@/types/chat';

/**
 * Hook for managing real-time message subscriptions
 * Handles conflict prevention during streaming and query invalidation
 */
export const useChatRealtime = (
  chatId: string | null, 
  dispatch: React.Dispatch<ChatAction>
) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const channelRef = useRef<any>(null);
  const isStreamingRef = useRef(false);
  
  const addDebugInfo = useCallback((info: string) => {
    dispatch({ type: 'ADD_DEBUG_INFO', payload: info });
    console.log(`🔍 [Real-time Debug] ${info}`);
  }, [dispatch]);
  
  useEffect(() => {
    if (!chatId || !user) {
      dispatch({ type: 'SET_REALTIME_STATUS', payload: false });
      return;
    }
    
    addDebugInfo(`Setting up real-time for chat ${chatId.slice(0, 8)}...`);
    
    // Clean up any existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
    
    const channel = supabase
      .channel(`chat-${chatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`
        },
        (payload) => {
          // ✅ FIX: Better streaming conflict prevention
          if (isStreamingRef.current) {
            addDebugInfo('Skipping real-time update during streaming');
            return;
          }
          
          // ✅ FIX: Prevent duplicates by checking message content
          const isPlaceholder = payload.new.is_placeholder || payload.new.content === '';
          if (isPlaceholder) {
            addDebugInfo('Skipping placeholder message update');
            return;
          }
          
          addDebugInfo(`Message received: ${payload.new.is_ai_message ? 'AI' : 'User'}`);
          
          // ✅ FIX: Faster invalidation for smoother transitions
          const invalidateDelay = payload.new.is_ai_message ? 200 : 50;
          
          setTimeout(() => {
            // Only invalidate for non-temp messages
            if (!payload.new.content.includes('ai-temp-') && !payload.new.content.includes('streaming-temp')) {
              queryClient.invalidateQueries({ 
                queryKey: ['chat', 'messages', chatId],
                refetchType: 'active'
              });
              addDebugInfo('Real-time message query invalidated');
            }
          }, invalidateDelay);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          addDebugInfo('Real-time connected successfully');
          dispatch({ type: 'SET_REALTIME_STATUS', payload: true });
        } else if (status === 'CHANNEL_ERROR') {
          addDebugInfo('Real-time connection failed');
          dispatch({ type: 'SET_REALTIME_STATUS', payload: false });
        }
      });
    
    channelRef.current = channel;
    
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [chatId, user, addDebugInfo, dispatch, queryClient]);
  
  return { 
    isStreamingRef,
    isConnected: !!channelRef.current 
  };
};
