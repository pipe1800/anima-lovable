import { useReducer, useMemo, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getUserCredits, getCharacterDetails } from '@/lib/supabase-queries';
import { handleChatError } from '@/utils/chatErrorHandling';
import { useChatMessages } from './useChatMessages';
import { useChatRealtime } from './useChatRealtime';
import { useChatStreaming } from './useChatStreaming';
import { useChatContext } from './useChatContext';
import { useChatPolling } from './useChatPolling';
import type { Message, TrackedContext, ChatState, ChatAction } from '@/types/chat';

// Initial state for chat
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

// Chat reducer for state management
const chatReducer = (state: ChatState, action: ChatAction): ChatState => {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.payload],
        lastActivity: Date.now()
      };
    
    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map(msg => 
          msg.id === action.payload.id ? { ...msg, ...action.payload.updates } : msg
        )
      };
    
    case 'SET_TYPING':
      return { ...state, isTyping: action.payload };
    
    case 'UPDATE_CONTEXT':
      return { ...state, trackedContext: action.payload };
    
    case 'SET_MESSAGES':
      return { ...state, messages: action.payload, lastActivity: Date.now() };
    
    case 'REMOVE_PENDING':
      const newPendingMessages = new Map(state.pendingMessages);
      newPendingMessages.delete(action.payload);
      return { ...state, pendingMessages: newPendingMessages };

    case 'SET_REALTIME_STATUS':
      return { ...state, isRealtimeConnected: action.payload };

    case 'ADD_DEBUG_INFO':
      const timestamp = new Date().toLocaleTimeString();
      const newDebugInfo = [...state.debugInfo.slice(-4), `${timestamp}: ${action.payload}`];
      return { ...state, debugInfo: newDebugInfo };
    
    case 'SET_STREAMING':
      return {
        ...state,
        isStreaming: action.payload.isStreaming,
        streamingMessage: action.payload.message || ''
      };
    
    case 'CLEAR_STATE':
      return initialChatState;
    
    case 'SET_HAS_GREETING':
      return { ...state, hasGreeting: action.payload };
      
    default:
      return state;
  }
};

/**
 * Main orchestrator hook for chat functionality
 * Coordinates all chat-related hooks and provides unified API
 */
export const useChatOrchestrator = (chatId: string | null, characterId: string) => {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const { user } = useAuth();
  
  // Initialize all sub-hooks
  const messagesQuery = useChatMessages(chatId);
  const { isStreamingRef } = useChatRealtime(chatId, dispatch);
  const sendMessageMutation = useChatStreaming(dispatch, isStreamingRef);
  
  useChatPolling(chatId, state.isRealtimeConnected);
  
  // Get user credits
  const { data: creditsBalance = 0 } = useQuery({
    queryKey: ['user', 'credits', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');
      const result = await getUserCredits(user.id);
      if (result.error) throw result.error;
      return result.data?.balance || 0;
    },
    enabled: !!user,
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  });
  
  // Get character details
  const { data: characterDetails } = useQuery({
    queryKey: ['character', 'details', characterId],
    queryFn: () => getCharacterDetails(characterId),
    enabled: !!characterId,
    staleTime: 5 * 60 * 1000,
  });

  // Combine database messages with temporary streaming messages
  const allMessages = useMemo(() => {
    // Only use database messages - no more temp message complexity!
    const dbMessages = messagesQuery.data?.pages?.flatMap(page => page.messages) || [];
    
    // Simple sorting by message_order - that's it!
    const sortedMessages = dbMessages.sort((a, b) => {
      return (a.message_order || 0) - (b.message_order || 0);
    });

    return sortedMessages;
  }, [messagesQuery.data?.pages, state.messages]);
  
  // Extract context from messages
  const { currentContext } = useChatContext(allMessages, state.trackedContext);
  
  // Update context when it changes (deep comparison)
  useEffect(() => {
    // Deep comparison of context objects
    const hasContextChanged = currentContext && (
      currentContext.moodTracking !== state.trackedContext.moodTracking ||
      currentContext.clothingInventory !== state.trackedContext.clothingInventory ||
      currentContext.locationTracking !== state.trackedContext.locationTracking ||
      currentContext.timeAndWeather !== state.trackedContext.timeAndWeather ||
      currentContext.relationshipStatus !== state.trackedContext.relationshipStatus ||
      currentContext.characterPosition !== state.trackedContext.characterPosition
    );

    if (hasContextChanged) {
      // Debounce context updates to prevent excessive state changes
      const timeoutId = setTimeout(() => {
        console.log('🔄 Context changed, updating state:', {
          old: state.trackedContext,
          new: currentContext
        });
        dispatch({ type: 'UPDATE_CONTEXT', payload: currentContext });
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [currentContext, state.trackedContext]);
  
  // ✅ FIX: Enhanced auto-clear streaming state when database message appears
  useEffect(() => {
    if (state.isStreaming && state.streamingMessage) {
      // More precise matching to ensure we only clear when the exact message appears
      const hasMatchingDbMessage = allMessages.some(msg => 
        !msg.isUser && 
        !msg.id.includes('streaming-temp') &&
        !msg.id.includes('optimistic') &&
        msg.content.trim() === state.streamingMessage.trim() &&
        msg.status !== 'sending' // Ensure it's a real database message
      );
      
      if (hasMatchingDbMessage) {
        console.log('🔄 Exact database message found, clearing streaming state immediately');
        // Use a small delay to ensure smooth transition
        setTimeout(() => {
          dispatch({
            type: 'SET_STREAMING',
            payload: { isStreaming: false, message: '' }
          });
        }, 100); // Very short delay for smooth transition
      }
    }
  }, [allMessages, state.isStreaming, state.streamingMessage, dispatch]);
  
  // Clean up optimistic user messages when database versions appear
  useEffect(() => {
    const dbMessages = messagesQuery.data?.pages?.flatMap(page => page.messages) || [];
    const optimisticMessages = state.messages.filter(msg => msg.id.startsWith('user-optimistic-'));
    
    optimisticMessages.forEach(optimisticMsg => {
      // Check if there's a matching database message (same content, recent timestamp)
      const hasMatchingDbMessage = dbMessages.some(dbMsg => 
        dbMsg.isUser && 
        dbMsg.content === optimisticMsg.content &&
        Math.abs(dbMsg.timestamp.getTime() - optimisticMsg.timestamp.getTime()) < 30000 // 30 second window
      );
      
      if (hasMatchingDbMessage) {
        dispatch({
          type: 'SET_MESSAGES',
          payload: state.messages.filter(msg => msg.id !== optimisticMsg.id)
        });
      }
    });
  }, [messagesQuery.data?.pages, state.messages, dispatch]);
  
  // Send message handler
  const handleSendMessage = useCallback(async (
    content: string, 
    addonSettings?: any,
    selectedPersonaId?: string | null
  ) => {
    if (!user || !chatId || !content.trim()) return;
    
    if (creditsBalance < 1) {
      throw new Error('Insufficient credits');
    }
    
    dispatch({ type: 'SET_TYPING', payload: true });
    
    try {
      const result = await sendMessageMutation.mutateAsync({
        chatId,
        content,
        characterId,
        trackedContext: state.trackedContext,
        addonSettings,
        selectedPersonaId
      });
      
      return result;
    } catch (error) {
      console.error('Send message error:', error);
      handleChatError(error, 'Failed to send message');
      throw error;
    } finally {
      dispatch({ type: 'SET_TYPING', payload: false });
    }
  }, [chatId, characterId, user, sendMessageMutation, state.trackedContext, creditsBalance]);
  
  return {
    // State
    messages: allMessages,
    isTyping: state.isTyping,
    trackedContext: state.trackedContext,
    isRealtimeConnected: state.isRealtimeConnected,
    debugInfo: state.debugInfo,
    isStreaming: state.isStreaming,
    streamingMessage: state.streamingMessage,
    
    // Actions
    sendMessage: handleSendMessage,
    
    // Credits
    creditsBalance,
    
    // Loading states
    isLoadingMessages: messagesQuery.isLoading,
    hasMore: messagesQuery.hasNextPage,
    isFetchingNextPage: messagesQuery.isFetchingNextPage,
    
    // Functions
    fetchNextPage: messagesQuery.fetchNextPage,
    clearChatState: () => dispatch({ type: 'CLEAR_STATE' }),
    
    // Performance metrics
    metrics: {
      messageCount: state.messages.length,
      connectionStatus: state.isRealtimeConnected ? 'connected' : 'disconnected',
      lastActivity: state.lastActivity
    }
  };
};
