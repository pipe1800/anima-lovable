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
import { getChatSnapshot, getChatContextEnhanced } from '@/data/chats/queries';

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
  // Track current streaming AI message id so we can patch content locally
  const streamingMessageIdRef = useRef<string | undefined>(undefined);
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

  // Wrap dispatch to sync ref when streaming updates
  const baseDispatch = dispatch as React.Dispatch<ChatAction>;
  const safeDispatch = useCallback((action: ChatAction) => {
    if (action.type === 'SET_STREAMING') {
      isStreamingRef.current = action.payload.isStreaming;
    }
    baseDispatch(action);
  }, [baseDispatch]);

  useEffect(() => {
    if (!chatId || !user) {
      safeDispatch({ type: 'SET_REALTIME_STATUS', payload: false });
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
          if (!payload.new.content?.trim()) {
            addDebugInfo('Processing empty message');
          } else {
            addDebugInfo(`New message: ${payload.new.is_ai_message ? 'AI' : 'User'}`);
          }
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
          safeDispatch({ type: 'SET_REALTIME_STATUS', payload: true });
        } else if (status === 'CHANNEL_ERROR') {
          addDebugInfo('Real-time connection failed');
          safeDispatch({ type: 'SET_REALTIME_STATUS', payload: false });
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

        // Dispatch relationship meta update (new format: detail = meta). Keep legacy nested for backward compatibility.
        try {
          if (rawContext?.relationship_meta && typeof rawContext.relationship_meta === 'object') {
            const meta = rawContext.relationship_meta;
            logger.debug('Dispatching relationship meta update (fetch)', meta);
            window.dispatchEvent(new CustomEvent('relationship-meta-updated', { detail: meta }));
            // legacy wrapper
            window.dispatchEvent(new CustomEvent('relationship-meta-updated-legacy', { detail: { relationshipMeta: meta } }));
          }
        } catch (e) { logger.warn('relationshipMeta.dispatch.fail', e); }
      }
    } catch (err) {
      logger.error('Failed to fetch fresh context:', err);
    }
  }, [user, characterId]);

  // finalizeStreaming now that dependencies are declared
  const finalizeStreaming = useCallback((chatIdParam: string) => {
    dispatch({ type: 'SET_STREAMING', payload: { isStreaming: false, message: '' } });
    const sinceInsert = Date.now() - (lastInsertTsRef.current || 0);
    if (sinceInsert > 800) {
      throttledInvalidateChatData(chatIdParam);
    }
    if (user?.id) {
      throttledInvalidate(chatQueryKeys.user.credits(user.id));
    }
    setTimeout(() => fetchAndUpdateContext(chatIdParam), 500);
    try { window.dispatchEvent(new CustomEvent('chat-ai-response-finished')); } catch {}
  }, [throttledInvalidateChatData, throttledInvalidate, fetchAndUpdateContext, user?.id]);

  const invokeStreamingAI = useCallback(async (
    chatIdParam: string,
    userMessage: string,
    characterIdParam: string,
    userId: string,
    trackedContext?: TrackedContext,
    addonSettings?: any,
    selectedPersonaId?: string | null,
    selectedWorldInfoId?: string | null
  ) => {
    if (!chatIdParam) throw new Error('Missing chatId');
    const streamingModeSetting: 'smooth' | 'instant' = (globalSettings?.streaming_mode === 'instant') ? 'instant' : 'smooth';
    dispatch({ type: 'SET_STREAMING', payload: { isStreaming: true, message: '' } });
    console.log('[STREAM][start]', { chatId: chatIdParam, mode: streamingModeSetting, userMessageLen: userMessage.length });
    let aggregate = '';
    // remove unused local streamingMessageId variable
    try {
      await ChatManagement.sendMessageStreaming({
        chatId: chatIdParam,
        message: userMessage,
        characterId: characterIdParam,
        addonSettings: addonSettings || {},
        selectedPersonaId: selectedPersonaId ?? null,
        selectedWorldInfoId: selectedWorldInfoId ?? null
      }, {
        streamingMode: streamingModeSetting,
        onToken: (t, agg) => {
          aggregate = agg;
          console.log('[STREAM][token]', { tokenFrag: t, fragLen: t.length, aggLen: agg.length, smooth: streamingModeSetting === 'smooth' });
          // Only update local streaming state; no cache mutation / placeholder patching
          dispatch({ type: 'SET_STREAMING', payload: { isStreaming: true, message: agg } });
        },
        onDone: (final) => {
          aggregate = final;
          console.log('[STREAM][done]', { finalLen: final.length });
        }
      });
      finalizeStreaming(chatIdParam);
      return aggregate;
    } catch (e) {
      dispatch({ type: 'SET_STREAMING', payload: { isStreaming: false, message: '' } });
      throw e;
    }
  }, [ChatManagement, finalizeStreaming, globalSettings?.streaming_mode]);

  // NEW: fetch current context immediately when chat loads (before any user message) so sidebar shows initial relationship goal
  useEffect(() => {
    if (chatId && user) {
      fetchAndUpdateContext(chatId);
    }
  }, [chatId, user, fetchAndUpdateContext]);

  // NEW: real-time subscription for chat_context updates (INSERT/UPDATE) to live-update trackers instantly
  const contextChannelRef = useRef<any>(null);
  useEffect(() => {
    if (!chatId || !user) {
      if (contextChannelRef.current) {
        supabase.removeChannel(contextChannelRef.current);
        contextChannelRef.current = null;
      }
      return;
    }
    // Clean previous
    if (contextChannelRef.current) {
      supabase.removeChannel(contextChannelRef.current);
      contextChannelRef.current = null;
    }
    const channel = supabase
      .channel(`chat-context-${chatId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_context', filter: `chat_id=eq.${chatId}` }, (payload: any) => {
        try {
          const row = payload.new || payload.old;
          if (!row) return;
          if (row.user_id !== user.id || row.character_id !== characterId) return; // safety
          const raw = row.current_context || {};
          const updated: TrackedContext = {
            moodTracking: raw.mood || 'No context',
            clothingInventory: raw.clothing || 'No context',
            locationTracking: raw.location || 'No context',
            timeAndWeather: raw.time_weather || 'No context',
            relationshipStatus: raw.relationship || 'No context',
            characterPosition: raw.character_position || 'No context',
            enchantmentStatus: raw.enchantment_status || 'No context',
            itemInventory: raw.item_inventory || 'No context'
          };
          // Only dispatch if something changed to avoid re-renders
            dispatch({ type: 'UPDATE_CONTEXT', payload: updated });
          logger.debug('Realtime chat_context applied', { rel: updated.relationshipStatus });
          // Fire custom event for existing listeners (Chat.tsx)
          try { window.dispatchEvent(new CustomEvent('chat-context-updated', { detail: { chatId, context: { relationship: updated.relationshipStatus } } })); } catch {}
          try {
            if (raw.relationship_meta) {
              logger.debug('Dispatching relationship meta update (realtime)', raw.relationship_meta);
              window.dispatchEvent(new CustomEvent('relationship-meta-updated', { detail: raw.relationship_meta }));
              window.dispatchEvent(new CustomEvent('relationship-meta-updated-legacy', { detail: { relationshipMeta: raw.relationship_meta } }));
            }
          } catch {}
        } catch (e) {
          logger.error('chat_context.realtime.apply.error', e);
        }
      });
    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        logger.debug('Subscribed to chat_context realtime for chat', chatId);
      }
    });
    contextChannelRef.current = channel;
    return () => {
      if (contextChannelRef.current) {
        supabase.removeChannel(contextChannelRef.current);
        contextChannelRef.current = null;
      }
    };
  }, [chatId, user, characterId, logger]);

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
    
    clearChatState: () => safeDispatch({ type: 'CLEAR_STATE' }),
    
    metrics: {
      messageCount: allMessages.length,
      connectionStatus: state.isRealtimeConnected ? 'connected' : 'disconnected',
      lastActivity: state.lastActivity,
    },
  };
};

function convertContext(raw: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    if (!raw) return null;
    return {
      moodTracking: raw.mood || 'No context',
      clothingInventory: raw.clothing || 'No context',
      locationTracking: raw.location || 'No context',
      timeAndWeather: raw.time_weather || 'No context',
      relationshipStatus: raw.relationship || 'No context',
      characterPosition: raw.character_position || 'No context',
      enchantmentStatus: raw.enchantment_status || 'No context',
      itemInventory: raw.item_inventory || 'No context'
    };
  } catch { return null; }
}
