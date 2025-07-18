import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { getRecentChatMessages, getEarlierChatMessages } from '@/lib/supabase-queries';
import type { Message } from '@/types/chat';

/**
 * Hook for fetching and caching chat messages with infinite scroll support
 * Handles pagination, caching, and message transformations
 */
export const useChatMessages = (chatId: string | null) => {
  // Memoized query function
  const queryFn = useCallback(async ({ pageParam = undefined }) => {
    if (!chatId) return { messages: [], hasMore: false, oldestMessageOrder: null };
    
    const limit = 20;
    let result;
    
    if (pageParam) {
      result = await getEarlierChatMessages(chatId, pageParam, limit);
    } else {
      result = await getRecentChatMessages(chatId, limit);
    }
    
    if (result.error) throw result.error;
    
    const messages: Message[] = result.data.map(msg => ({
      id: msg.id,
      content: msg.content,
      isUser: !msg.is_ai_message,
      timestamp: new Date(msg.created_at),
      status: 'sent' as const,
      contextUpdates: (msg as any).message_context?.[0]?.context_updates,
      current_context: (msg as any).current_context,
      message_order: (msg as any).message_order // Add message_order to the frontend message object
    }));
    
    return {
      messages,
      hasMore: result.data.length === limit,
      oldestMessageOrder: result.data.length > 0 ? (result.data[0] as any).message_order : null
    };
  }, [chatId]);

  return useInfiniteQuery({
    queryKey: ['chat', 'messages', chatId],
    queryFn,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.oldestMessageOrder : undefined,
    initialPageParam: undefined,
    enabled: !!chatId,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
};
