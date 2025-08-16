import { useReducer, useCallback, useEffect, useRef, useMemo } from 'react';
import { useMutation, useQueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, SUPABASE_API_URL } from '@/integrations/supabase/client';
import { getCharacterDetails } from '@/lib/supabase-queries';
import { handleChatError } from '@/utils/chatErrorHandling';
import { queryConfigs, infiniteQueryConfigs, invalidationHelpers, queryKeys } from '@/queries/chatQueries';
import { useUserGlobalChatSettings } from '@/queries/chatSettingsQueries';
import type { Message, TrackedContext, ChatState, ChatAction } from '@/types/chat';
import logger from '@/utils/logger';
import { StreamingMessageParser, parseSSEMessage } from '@/lib/streaming-utils';

/**
 * Unified Chat Hook - Replaces 4 separate hooks
 * 
 * Consolidates:
 * - useChatOrchestrator (state management)
 * - useChatStreaming (AI responses) 
 * - useChatRealtime (live updates)
 * - useChatMessages (message fetching)
 * 
 * Benefits:
 * - Single source of truth for chat state
 * - Simplified data flow
 * - Better performance (fewer re-renders)
 * - Easier testing and debugging
 */

// Initial chat state
const initialChatState: ChatState = {
  messages: [],
  isTyping: false,
  trackedContext: {
    moodTracking: 'No context',
    clothingInventory: 'No context', 
    locationTracking: 'No context',
    timeAndWeather: 'No context',
    relationshipStatus: 'No context',
    characterPosition: 'No context'
  },
  pendingMessages: new Map(),
  lastActivity: Date.now(),
  isRealtimeConnected: false,
  debugInfo: [],
  isStreaming: false,
  streamingMessage: '',
  hasGreeting: false
};

// Unified state reducer
function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_STREAMING':
      // ✅ SIMPLIFIED: Basic streaming state management
      return {
        ...state,
        isStreaming: action.payload.isStreaming,
        streamingMessage: action.payload.message || ''
      };
    
    case 'SET_TYPING':
      return { ...state, isTyping: action.payload };
    
    case 'SET_REALTIME_STATUS':
      return { ...state, isRealtimeConnected: action.payload };
    
    case 'ADD_DEBUG_INFO':
      return {
        ...state,
        debugInfo: [...state.debugInfo.slice(-9), action.payload] // Keep last 10
      };
    
    case 'UPDATE_CONTEXT':
      return { ...state, trackedContext: action.payload };
    
    case 'CLEAR_STATE':
      return { ...initialChatState, lastActivity: Date.now() };
    
    default:
      return state;
  }
}

export const useChatUnified = (chatId: string | null, characterId: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const isStreamingRef = useRef(false);
  const channelRef = useRef<any>(null);
  
  // Get global chat settings for streaming preferences
  const { data: globalSettings } = useUserGlobalChatSettings();

  // ============================================================================
  // MESSAGE FETCHING (replaces useChatMessages)
  // ============================================================================
  const messagesQuery = useInfiniteQuery({
    ...infiniteQueryConfigs.chatMessages(chatId || ''),
    enabled: !!chatId
  });

  // Get credits balance
  const { data: creditsBalance = 0 } = useQuery({
    ...queryConfigs.userCredits(user?.id || ''),
    enabled: !!user,
  });

  // Get character details
  const { data: characterDetails } = useQuery({
    ...queryConfigs.characterDetails(characterId),
    enabled: !!characterId
  });

  // ============================================================================
  // REAL-TIME SUBSCRIPTIONS (replaces useChatRealtime)
  // ============================================================================
  const addDebugInfo = useCallback((info: string) => {
    logger.debug(info);
    dispatch({ type: 'ADD_DEBUG_INFO', payload: info });
  }, []);

  useEffect(() => {
    if (!chatId || !user) {
      dispatch({ type: 'SET_REALTIME_STATUS', payload: false });
      return;
    }
    
    addDebugInfo(`Setting up real-time for chat ${chatId.slice(0, 8)}...`);
    
    // Clean up existing channel
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
          // ✅ Refined: allow initial greeting (message_order === 1) to invalidate even during streaming
          if (isStreamingRef.current && !(payload.new.is_ai_message && payload.new.message_order === 1)) {
            addDebugInfo('Skipping real-time update - streaming active (non-greeting)');
            return;
          }
          if (payload.new.is_placeholder || !payload.new.content?.trim()) {
            addDebugInfo('Skipping empty/placeholder message');
            return;
          }
          addDebugInfo(`New message: ${payload.new.is_ai_message ? 'AI' : 'User'}`);
          setTimeout(() => {
            invalidationHelpers.invalidateChatData(queryClient, chatId);
            addDebugInfo('Real-time chat data invalidated');
          }, 100);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`
        },
        (payload) => {
          // ✅ Handle context updates to messages
          if (isStreamingRef.current) {
            addDebugInfo('Skipping real-time update - streaming active');
            return;
          }
          
          addDebugInfo(`Message updated: ${payload.new.is_ai_message ? 'AI' : 'User'} context`);
          
          // Invalidate to pick up context updates
          setTimeout(() => {
            invalidationHelpers.invalidateChatData(queryClient, chatId);
            addDebugInfo('Real-time context invalidated');
          }, 100);
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
  }, [chatId, user, addDebugInfo, queryClient]);

  // ============================================================================
  // STREAMING AI RESPONSES (replaces useChatStreaming)
  // ============================================================================
  const fetchAndUpdateContext = useCallback(async (chatIdLocal: string) => {
    if (!user) return;
    try {
      const { data: contextData, error } = await supabase
        .from('chat_context')
        .select('current_context')
        .eq('chat_id', chatIdLocal)
        .eq('user_id', user.id)
        .eq('character_id', characterId)
        .maybeSingle();

      if (!error && contextData?.current_context) {
        logger.debug('Fresh context fetched', contextData.current_context);

        const rawContext = contextData.current_context as any;
        const convertedContext = {
          moodTracking: rawContext?.mood || 'No context',
          clothingInventory: rawContext?.clothing || 'No context',
          locationTracking: rawContext?.location || 'No context',
          timeAndWeather: rawContext?.time_weather || 'No context',
          relationshipStatus: rawContext?.relationship || 'No context',
          characterPosition: rawContext?.character_position || 'No context'
        } as TrackedContext;

        dispatch({ type: 'UPDATE_CONTEXT', payload: convertedContext });
        logger.debug('Context updated in UI immediately!');
      }
    } catch (err) {
      logger.error('Failed to fetch fresh context:', err);
    }
  }, [user, characterId]);

  // Helper to finalize streaming and refresh messages/context
  const finalizeStreaming = useCallback((chatIdParam: string) => {
    // Clear streaming state
    dispatch({ type: 'SET_STREAMING', payload: { isStreaming: false, message: '' } });
    // Refresh messages to show final result
    invalidationHelpers.invalidateChatData(queryClient, chatIdParam);
    // Also refresh credits and message count explicitly
    if (user?.id) {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.credits(user.id), exact: true });
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.messageCount(chatIdParam), exact: true });
    // Fetch context shortly after backend finishes
    setTimeout(() => fetchAndUpdateContext(chatIdParam), 1000);
    // Notify UI that AI response is done
    try {
      const ev = new CustomEvent('chat-ai-response-finished');
      window.dispatchEvent(ev);
    } catch {}
  }, [queryClient, fetchAndUpdateContext, user?.id]);

  const invokeStreamingAI = async (
    chatId: string, 
    userMessage: string, 
    characterId: string, 
    userId: string,
    trackedContext?: TrackedContext,
    addonSettings?: any,
    selectedPersonaId?: string | null,
    selectedWorldInfoId?: string | null
  ) => {
    const startTime = Date.now();
    isStreamingRef.current = true;
    
    try {
      // Get fresh session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) {
        throw new Error('Authentication failed: Please sign in again');
      }

      let session = sessionData.session;

      // Check token expiration and refresh if needed
      const now = Math.floor(Date.now() / 1000);
      if (session.expires_at && session.expires_at <= (now + 30)) {
        const { data: refreshResult, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshResult.session) {
          await supabase.auth.signOut();
          throw new Error('Authentication failed: Please sign in again');
        }
        session = refreshResult.session;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const requestPayload = {
        operation: 'send-message',
        chatId,
        message: userMessage,
        characterId,
        addonSettings,
        selectedPersonaId,
        selectedWorldInfoId
      };      // Set initial streaming state
      dispatch({
        type: 'SET_STREAMING',
        payload: { isStreaming: true, message: '' }
      });
      
      // Make streaming request to unified chat-management function
      const response = await fetch(`${SUPABASE_API_URL}/functions/v1/chat-management`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': SUPABASE_API_URL ? (supabase as any).rest.headers['apikey'] || (import.meta.env?.VITE_SUPABASE_ANON_KEY as string) : (import.meta.env?.VITE_SUPABASE_ANON_KEY as string),
        },
        body: JSON.stringify(requestPayload),
      });
      
      if (!response.ok) {
        dispatch({
          type: 'SET_STREAMING',
          payload: { isStreaming: false, message: '' }
        });
        
        const errorText = await response.text();
        if (response.status === 401) {
          throw new Error('Authentication failed: Please sign in again');
        } else if (response.status === 402) {
          throw new Error('Insufficient credits');
        } else {
          throw new Error(`Request failed: ${response.status} - ${errorText || 'Unknown error'}`);
        }
      }

      // ===== STREAMING MODE IMPLEMENTATION =====
      // Handle different streaming modes based on user preferences
      const streamingMode = globalSettings?.streaming_mode || 'smooth';
      const showStreamingUpdates = streamingMode === 'smooth';
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available for streaming response');
      }
      
      let fullMessage = '';
      const decoder = new TextDecoder();
      const parser = new StreamingMessageParser();
      let pendingAppend: Promise<void> = Promise.resolve();

      const scheduleAppend = async (text: string) => {
        if (!text) return;
        if (!showStreamingUpdates) {
          fullMessage += text;
          return;
        }
        const sliceSize = 24; // small slices to keep UI feeling streaming
        for (let i = 0; i < text.length; i += sliceSize) {
          const part = text.slice(i, i + sliceSize);
          fullMessage += part;
          dispatch({ type: 'SET_STREAMING', payload: { isStreaming: true, message: fullMessage } });
          // Yield to UI so updates paint progressively
          await new Promise<void>(r => setTimeout(r, 16));
        }
      };
      
      // Both modes share the same parsing, only UI updates differ
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          // Accumulate SSE buffer and extract complete data lines
          const dataLines = parser.parseChunk(value);
          for (const data of dataLines) {
            const obj = parseSSEMessage(data);
            if (!obj) continue;

            if (obj.done === true) {
              logger.info(`${streamingMode} mode - Stream completed`);
              isStreamingRef.current = false;
              // Ensure all pending UI appends are flushed before finalizing
              await pendingAppend;
              finalizeStreaming(chatId);
              const endTime = Date.now();
              return { content: fullMessage };
            }

            if (typeof obj?.content === 'string' && obj.content.length > 0) {
              pendingAppend = pendingAppend.then(() => scheduleAppend(obj.content));
              continue;
            }

            if (obj?.choices?.[0]?.delta?.content) {
              const content = obj.choices[0].delta.content as string;
              pendingAppend = pendingAppend.then(() => scheduleAppend(content));
              continue;
            }
          }
        }
        // Stream ended without explicit done flag; flush and finalize
        await pendingAppend;
        isStreamingRef.current = false;
        finalizeStreaming(chatId);
        return { content: fullMessage };
      } catch (streamError) {
        logger.error('Streaming error:', streamError);
        isStreamingRef.current = false;
        dispatch({ type: 'SET_STREAMING', payload: { isStreaming: false, message: '' } });
        throw new Error('Streaming error, please try again');
      }
    } catch (err) {
      logger.error('Streaming invocation error:', err);
      isStreamingRef.current = false;
      dispatch({ type: 'SET_STREAMING', payload: { isStreaming: false, message: '' } });
      throw err;
    }
  };

  // ============================================================================
  // EFFECTS & SUBSCRIPTIONS
  // ============================================================================
  useEffect(() => {
    // Log state changes for debugging
    logger.debug('Chat state updated:', state);
  }, [state]);

  // ==========================================================================
  // SEND MESSAGE MUTATION (restored)
  // ==========================================================================
  const sendMessageMutation = useMutation({
    mutationFn: async ({ 
      chatId, 
      content, 
      characterId,
      trackedContext,
      addonSettings,
      selectedPersonaId,
      selectedWorldInfoId
    }: { 
      chatId: string; 
      content: string; 
      characterId: string;
      trackedContext?: TrackedContext;
      addonSettings?: any;
      selectedPersonaId?: string | null;
      selectedWorldInfoId?: string | null;
    }) => {
      if (!user) throw new Error('User not authenticated');
      const startTime = Date.now();

      try {
        const aiResult = await invokeStreamingAI(
          chatId,
          content,
          characterId,
          user.id,
          trackedContext,
          addonSettings,
          selectedPersonaId,
          selectedWorldInfoId
        );
        
        invalidationHelpers.invalidateAfterMessage(queryClient, chatId, user.id);
        const endTime = Date.now();
        return { chatId, content, updatedContext: aiResult, metrics: { sendTime: endTime - startTime } };
      } catch (error) {
        invalidationHelpers.invalidateAfterMessage(queryClient, chatId, user.id);
        throw error;
      }
    },
    onMutate: async ({ chatId, content }) => {
      const key = queryKeys.chat.messages(chatId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);

      // Build optimistic user message
      const optimisticId = `user-optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimisticMessage = {
        id: optimisticId,
        content,
        isUser: true,
        timestamp: new Date(),
        status: 'sending' as const,
        message_order: (() => {
          const data: any = previous as any;
          const all = data?.pages?.flatMap((p: any) => p.messages) || [];
          const maxOrder = all.length ? Math.max(...all.map((m: any) => m.message_order || 0)) : 0;
          return maxOrder + 1;
        })()
      };

      // Update cache: append to first page (most recent)
      queryClient.setQueryData(key, (old: any) => {
        if (!old?.pages?.length) {
          return {
            pages: [{ messages: [optimisticMessage], hasMore: false, oldestMessageOrder: null }],
            pageParams: [undefined]
          };
        }
        const first = old.pages[0];
        const updatedFirst = { ...first, messages: [...first.messages, optimisticMessage] };
        return { ...old, pages: [updatedFirst, ...old.pages.slice(1)] };
      });

      return { previous, key };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.key) {
        queryClient.setQueryData(ctx.key, ctx.previous);
      }
    },
    onSettled: (_data, _error, vars) => {
      if (vars?.chatId && user?.id) {
        invalidationHelpers.invalidateAfterMessage(queryClient, vars.chatId, user.id);
      }
    }
  });

  // ==========================================================================
  // COMBINED MESSAGE LIST WITH SORTING (restored)
  // ==========================================================================
  const allMessages = useMemo(() => {
    const dbMessages = messagesQuery.data?.pages?.flatMap(page => page.messages) || [];
    const sorted = dbMessages.sort((a, b) => (a.message_order || 0) - (b.message_order || 0));
    return sorted.map((m: any) => {
      if (m && typeof m === 'object') {
        const role = m.role || (m.is_ai_message ? 'assistant' : (m.isUser ? 'user' : undefined));
        const is_ai_message = m.is_ai_message !== undefined ? m.is_ai_message : role === 'assistant';
        const isUser = m.isUser !== undefined ? m.isUser : role === 'user';
        return { ...m, role, is_ai_message, isUser };
      }
      return m;
    });
  }, [messagesQuery.data?.pages]);

  // Extract context from latest AI message if available (restored)
  const extractedContext = useMemo(() => {
    if (!allMessages.length) return state.trackedContext;
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const message = allMessages[i];
      if (!message.isUser && message.current_context) {
        return message.current_context as TrackedContext;
      }
    }
    return state.trackedContext;
  }, [allMessages, state.trackedContext]);

  useEffect(() => {
    if (extractedContext !== state.trackedContext) {
      dispatch({ type: 'UPDATE_CONTEXT', payload: extractedContext });
    }
  }, [extractedContext, state.trackedContext]);

  // ==========================================================================
  // PUBLIC SEND HANDLER (restored)
  // ==========================================================================
  const handleSendMessage = useCallback(async (
    content: string, 
    addonSettings?: any,
    selectedPersonaId?: string | null,
    selectedWorldInfoId?: string | null,
    overrideContext?: TrackedContext,
    overrideChatId?: string
  ) => {
    const effectiveChatId = overrideChatId || chatId;
    if (!user || !effectiveChatId || !content.trim()) return;
    if (creditsBalance < 1) throw new Error('Insufficient credits');

    dispatch({ type: 'SET_TYPING', payload: true });
    try {
      const result = await sendMessageMutation.mutateAsync({
        chatId: effectiveChatId,
        content,
        characterId,
        trackedContext: overrideContext || state.trackedContext,
        addonSettings,
        selectedPersonaId,
        selectedWorldInfoId
      });
      return result;
    } catch (error) {
      logger.error('Send message error:', error);
      handleChatError(error, 'Failed to send message');
      throw error;
    } finally {
      dispatch({ type: 'SET_TYPING', payload: false });
    }
  }, [user, chatId, characterId, sendMessageMutation, state.trackedContext, creditsBalance]);

  // ==========================================================================
  // RETURN UNIFIED INTERFACE (restored)
  // ==========================================================================
  return {
    messages: allMessages,
    isTyping: state.isTyping,
    trackedContext: state.trackedContext,
    isRealtimeConnected: state.isRealtimeConnected,
    debugInfo: state.debugInfo,
    isStreaming: state.isStreaming,
    streamingMessage: state.streamingMessage,
    
    sendMessage: handleSendMessage,
    
    creditsBalance,
    
    isLoadingMessages: messagesQuery.isLoading,
    hasMore: messagesQuery.hasNextPage,
    isFetchingNextPage: messagesQuery.isFetchingNextPage,
    fetchNextPage: messagesQuery.fetchNextPage,
    
    clearChatState: () => dispatch({ type: 'CLEAR_STATE' }),
    
    metrics: {
      messageCount: allMessages.length,
      connectionStatus: state.isRealtimeConnected ? 'connected' : 'disconnected',
      lastActivity: state.lastActivity,
    },
  };
};
