import { useReducer, useCallback, useEffect, useRef, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, SUPABASE_API_URL } from '@/db/client';
import { handleChatError } from '@/utils/chatErrorHandling';
import { chatQueryConfigs, chatInfiniteQueryConfigs, chatInvalidationHelpers, chatQueryKeys } from '@/data/chats/queryKeys';
import { useUserGlobalChatSettings } from '@/data/chats/settings';
import type { Message, TrackedContext, ChatState, ChatAction } from '@/types/chat';
import logger from '@/utils/logger';
import { StreamingMessageParser, parseSSEMessage } from '@/lib/streaming-utils';
import { ChatManagement } from '@/data/edge';

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
    characterPosition: 'No context',
    enchantmentStatus: 'No context', // NEW
    itemInventory: 'No context' // NEW
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

interface UseChatUnifiedOptions {
  skipCreditsFetch?: boolean;
  externalCreditsBalance?: number;
  externalGlobalSettings?: any; // UserGlobalChatSettings (kept loose to avoid import chain here)
}

export const useChatUnified = (chatId: string | null, characterId: string, options: UseChatUnifiedOptions = {}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const isStreamingRef = useRef(false);
  const channelRef = useRef<any>(null);
  // Throttle map to prevent redundant invalidations hammering backend
  const lastInvalidationRef = useRef<Record<string, number>>({});
  const THROTTLE_MS = 1500; // widened to reduce rapid duplicate refetches

  const throttledInvalidate = useCallback((key: any) => {
    try {
      const now = Date.now();
      const flatKey = JSON.stringify(key);
      const last = lastInvalidationRef.current[flatKey] || 0;
      if (now - last < THROTTLE_MS) {
        return; // skip rapid duplicate
      }
      lastInvalidationRef.current[flatKey] = now;
      queryClient.invalidateQueries({ queryKey: key, exact: true });
    } catch {}
  }, [queryClient]);

  const throttledInvalidateChatData = useCallback((chatIdLocal: string) => {
    throttledInvalidate(chatQueryKeys.chat.messages(chatIdLocal));
  }, [throttledInvalidate]);
  
  // Get global chat settings for streaming preferences (allow external override to prevent duplicate fetch)
  // Skip fetching global settings if an external override was supplied
  const { data: internalGlobalSettings } = useUserGlobalChatSettings({ enabled: !options.externalGlobalSettings });
  const globalSettings = options.externalGlobalSettings || internalGlobalSettings;

  // ============================================================================
  // MESSAGE FETCHING (replaces useChatMessages)
  // ============================================================================
  const messagesQuery = useInfiniteQuery({
    ...chatInfiniteQueryConfigs.chatMessages(chatId || ''),
    enabled: !!chatId
  });

  // Get credits balance unless provided externally to avoid duplicate network calls
  const { data: internalCreditsBalance = 0 } = useQuery({
    ...chatQueryConfigs.userCredits(user?.id || ''),
    enabled: !!user && !options.skipCreditsFetch,
  });
  const creditsBalance = options.externalCreditsBalance ?? internalCreditsBalance;
  // Preserve last known non-zero credits to avoid transient 0 due to race / RLS lag
  const lastNonZeroCreditsRef = useRef<number>(0);
  if (creditsBalance > 0 && creditsBalance !== lastNonZeroCreditsRef.current) {
    lastNonZeroCreditsRef.current = creditsBalance;
  }
  // TEMP DEBUG: log credits balance fetch results
  const lastInsertTsRef = useRef<number>(0);

  useEffect(() => {
    logger.debug('[Credits] useChatUnified creditsBalance changed:', creditsBalance, 'user:', user?.id);
  }, [creditsBalance, user?.id]);

  // Removed duplicate character details query (already fetched upstream & unused here)

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
          lastInsertTsRef.current = Date.now();
          setTimeout(() => {
            // Real-time invalidation throttled
            throttledInvalidateChatData(chatId);
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
            throttledInvalidateChatData(chatId);
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
          characterPosition: rawContext?.character_position || 'No context',
          enchantmentStatus: rawContext?.enchantment_status || 'No context', // NEW
          itemInventory: rawContext?.item_inventory || 'No context' // NEW
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
    dispatch({ type: 'SET_STREAMING', payload: { isStreaming: false, message: '' } });
    // Avoid double invalidation if real-time INSERT just arrived very recently
    const sinceInsert = Date.now() - (lastInsertTsRef.current || 0);
    if (sinceInsert > 800) {
      throttledInvalidateChatData(chatIdParam);
    } else {
      logger.debug('🛑 Skipping redundant post-stream invalidation (recent real-time insert)');
    }
    // Also refresh credits and message count explicitly
    if (user?.id) {
      throttledInvalidate(chatQueryKeys.user.credits(user.id));
    }
  // Removed message count query invalidation (derived via event)
    // Fetch context shortly after backend finishes
    setTimeout(() => fetchAndUpdateContext(chatIdParam), 1000);
    // Notify UI that AI response is done
    try {
      const ev = new CustomEvent('chat-ai-response-finished');
      window.dispatchEvent(ev);
    } catch {}
  }, [queryClient, fetchAndUpdateContext, user?.id, throttledInvalidate, throttledInvalidateChatData]);

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
      const streamingMode = globalSettings?.streaming_mode || 'smooth';
      dispatch({ type: 'SET_STREAMING', payload: { isStreaming: true, message: '' } });
      let fullMessage = '';
      const result = await ChatManagement.sendMessageStreaming({
        chatId,
        message: userMessage,
        characterId,
        addonSettings,
        selectedPersonaId,
        selectedWorldInfoId,
      }, {
        streamingMode,
        onToken: (token, aggregate) => {
          fullMessage = aggregate;
          if (streamingMode === 'smooth') {
            dispatch({ type: 'SET_STREAMING', payload: { isStreaming: true, message: aggregate } });
          }
        },
        onDone: (final) => {
          if (streamingMode !== 'smooth') {
            dispatch({ type: 'SET_STREAMING', payload: { isStreaming: true, message: final } });
          }
        }
      });
      isStreamingRef.current = false;
      finalizeStreaming(chatId);
      return { content: result.content };
    } catch (err) {
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
        const endTime = Date.now();
        return { chatId, content, updatedContext: aiResult, metrics: { sendTime: endTime - startTime } };
      } catch (error) {
        throw error;
      }
    },
    onMutate: async ({ chatId, content }) => {
      const key = chatQueryKeys.chat.messages(chatId);
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

      // Optimistically decrement credits (they will be refetched & reconciled after streaming)
      if (user?.id) {
        const creditKey = chatQueryKeys.user.credits(user.id);
        const current = queryClient.getQueryData<number>(creditKey);
        if (typeof current === 'number' && current > 0) {
          queryClient.setQueryData(creditKey, current - 1);
        }
      }

      return { previous, key };
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.key) {
        queryClient.setQueryData(ctx.key, ctx.previous);
      }
      // Rollback optimistic credit decrement if present
      if (user?.id) {
        throttledInvalidate(chatQueryKeys.user.credits(user.id));
      }
      if (vars?.chatId) {
        throttledInvalidate(chatQueryKeys.chat.messages(vars.chatId));
      }
    },
    // We intentionally do NOT invalidate onSettled; finalizeStreaming & real-time handle it
  });

  // ==========================================================================
  // COMBINED MESSAGE LIST WITH SORTING (restored)
  // ==========================================================================
  const allMessages = useMemo(() => {
    const dbMessages = (messagesQuery.data?.pages as any)?.flatMap((page: any) => page.messages) || [];
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
    const effectiveCredits = creditsBalance > 0 ? creditsBalance : lastNonZeroCreditsRef.current;
    if (effectiveCredits < 1) {
      logger.warn('[Credits] Blocked send. Reported balance:', creditsBalance, 'Last known non-zero:', lastNonZeroCreditsRef.current);
      throw new Error('Insufficient credits');
    }

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
      // If backend responded 402 while we had fallback credits, force refetch credits
      if ((error as any)?.message?.includes('Insufficient') && user?.id) {
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.user.credits(user.id) });
      }
      handleChatError(error, 'Failed to send message');
      throw error;
    } finally {
      dispatch({ type: 'SET_TYPING', payload: false });
    }
  }, [user, chatId, characterId, sendMessageMutation, state.trackedContext, creditsBalance]);

  // Listen for optimistic/authoritative context events from extraction util
  useEffect(() => {
    function onAddonContextUpdated(e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      try {
        const ctx = e.detail?.context as TrackedContext | undefined;
        if (!ctx) return;
        logger.debug('⚡ addon-context-updated event received', { optimistic: e.detail?.optimistic, ts: e.detail?.ts });
        dispatch({ type: 'UPDATE_CONTEXT', payload: ctx });
      } catch (err) {
        logger.warn('addon-context-updated handler failed', err);
      }
    }
    window.addEventListener('addon-context-updated', onAddonContextUpdated as any);
    return () => window.removeEventListener('addon-context-updated', onAddonContextUpdated as any);
  }, []);

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
