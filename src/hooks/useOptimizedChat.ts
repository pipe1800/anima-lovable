import { useQuery, useMutation, useQueryClient, useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState, useRef, useReducer, useCallback, useMemo } from 'react';
import { 
  getRecentChatMessages, 
  getEarlierChatMessages,
  createMessage, 
  consumeCredits,
  getUserCredits,
  getCharacterDetails
} from '@/lib/supabase-queries';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'failed';
  contextUpdates?: {
    [key: string]: {
      previous: string;
      current: string;
    };
  };
  current_context?: TrackedContext;
}

export interface TrackedContext {
  moodTracking: string;
  clothingInventory: string;
  locationTracking: string;
  timeAndWeather: string;
  relationshipStatus: string;
  characterPosition: string;
}

// Optimized Chat State Management
interface ChatState {
  messages: Message[];
  isTyping: boolean;
  trackedContext: TrackedContext;
  pendingMessages: Map<string, Message>;
  lastActivity: number;
}

type ChatAction =
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; updates: Partial<Message> } }
  | { type: 'SET_TYPING'; payload: boolean }
  | { type: 'UPDATE_CONTEXT'; payload: TrackedContext }
  | { type: 'SET_MESSAGES'; payload: Message[] }
  | { type: 'REMOVE_PENDING'; payload: string }
  | { type: 'CLEAR_STATE' };

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
  lastActivity: Date.now()
};

// Optimized reducer with batching
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
      return {
        ...state,
        isTyping: action.payload
      };
    
    case 'UPDATE_CONTEXT':
      return {
        ...state,
        trackedContext: action.payload
      };
    
    case 'SET_MESSAGES':
      return {
        ...state,
        messages: action.payload,
        lastActivity: Date.now()
      };
    
    case 'REMOVE_PENDING':
      const newPendingMessages = new Map(state.pendingMessages);
      newPendingMessages.delete(action.payload);
      return {
        ...state,
        pendingMessages: newPendingMessages
      };
    
    case 'CLEAR_STATE':
      return initialChatState;
    
    default:
      return state;
  }
};

// Optimized Chat Messages Hook with performance improvements
export const useOptimizedChatMessages = (chatId: string | null) => {
  const queryClient = useQueryClient();
  
  // Memoized query function
  const queryFn = useCallback(async ({ pageParam = undefined }) => {
    if (!chatId) return { messages: [], hasMore: false, oldestTimestamp: null };
    
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
      current_context: (msg as any).current_context
    }));
    
    return {
      messages,
      hasMore: result.data.length === limit,
      oldestTimestamp: result.data.length > 0 ? result.data[0].created_at : null
    };
  }, [chatId]);

  return useInfiniteQuery({
    queryKey: ['chat', 'messages', chatId],
    queryFn,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.oldestTimestamp : undefined,
    initialPageParam: undefined,
    enabled: !!chatId,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
};

// Optimized Send Message Hook with batching
export const useOptimizedSendMessage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      chatId, 
      content, 
      characterId,
      trackedContext,
      addonSettings,
      selectedPersonaId
    }: { 
      chatId: string; 
      content: string; 
      characterId: string;
      trackedContext?: TrackedContext;
      addonSettings?: any;
      selectedPersonaId?: string | null;
    }) => {
      if (!user) throw new Error('User not authenticated');
      
      const optimisticId = `temp-${Date.now()}`;
      const startTime = Date.now();
      
      // Optimistic update with batching
      queryClient.setQueryData(['chat', 'messages', chatId], (old: any) => {
        if (!old?.pages?.length) {
          return {
            pages: [{
              messages: [{
                id: optimisticId,
                content,
                isUser: true,
                timestamp: new Date(),
                status: 'sending' as const
              }],
              hasMore: false,
              oldestTimestamp: null
            }],
            pageParams: [undefined]
          };
        }
        
        const optimisticMessage: Message = {
          id: optimisticId,
          content,
          isUser: true,
          timestamp: new Date(),
          status: 'sending'
        };
        
        const firstPage = old.pages[0];
        const updatedFirstPage = {
          ...firstPage,
          messages: [...firstPage.messages, optimisticMessage]
        };
        
        return {
          ...old,
          pages: [updatedFirstPage, ...old.pages.slice(1)]
        };
      });
      
      try {
        // Batch operations: Save message + invoke AI
        const [messageResult, aiResult] = await Promise.all([
          createMessage(chatId, user.id, content, false),
          invokeOptimizedAI(chatId, content, characterId, user.id, trackedContext, addonSettings, selectedPersonaId)
        ]);
        
        if (messageResult.error) throw messageResult.error;
        
        // Update optimistic message to sent
        queryClient.setQueryData(['chat', 'messages', chatId], (old: any) => {
          if (!old) return old;
          
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              messages: page.messages.map((msg: Message) => 
                msg.id === optimisticId 
                  ? { ...msg, status: 'sent' as const, id: messageResult.data?.id || optimisticId }
                  : msg
              )
            }))
          };
        });
        
        const endTime = Date.now();
        console.log(`💨 Message sent in ${endTime - startTime}ms`);
        
        return { 
          chatId, 
          content, 
          optimisticId, 
          updatedContext: aiResult,
          metrics: { sendTime: endTime - startTime }
        };
        
      } catch (error) {
        // Update optimistic message to failed
        queryClient.setQueryData(['chat', 'messages', chatId], (old: any) => {
          if (!old) return old;
          
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              messages: page.messages.map((msg: Message) => 
                msg.id === optimisticId 
                  ? { ...msg, status: 'failed' as const }
                  : msg
              )
            }))
          };
        });
        throw error;
      }
    },
    onSuccess: () => {
      // Batch invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['user', 'credits', user?.id] });
    },
  });
};

// Optimized AI invocation with performance monitoring
const invokeOptimizedAI = async (
  chatId: string, 
  userMessage: string, 
  characterId: string, 
  userId: string,
  trackedContext?: TrackedContext,
  addonSettings?: any,
  selectedPersonaId?: string | null
) => {
  const startTime = Date.now();
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('User not authenticated');
    
    const requestPayload = {
      character_id: characterId,
      chat_id: chatId,
      model: 'mistralai/mistral-7b-instruct',
      user_message: userMessage,
      tracked_context: trackedContext,
      addon_settings: addonSettings,
      selected_persona_id: selectedPersonaId
    };
    
    console.log('🚀 Optimized AI request starting...');
    
    const response = await fetch(`https://rclpyipeytqbamiwcuih.supabase.co/functions/v1/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Edge function error:', errorText);
      throw new Error(`AI response failed: ${response.status}`);
    }
    
    const responseData = await response.json();
    
    if (!responseData.success || !responseData.content) {
      throw new Error('Invalid AI response received');
    }
    
    const endTime = Date.now();
    console.log(`⚡ AI response completed in ${endTime - startTime}ms`);
    console.log('📊 Metrics:', responseData.metrics);
    
    return responseData.updatedContext;
    
  } catch (error) {
    console.error('Optimized AI invocation error:', error);
    throw error;
  }
};

// Optimized Chat Hook with state management
export const useOptimizedChat = (chatId: string | null, characterId: string) => {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Memoized queries
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
  
  const { data: characterDetails } = useQuery({
    queryKey: ['character', 'details', characterId],
    queryFn: async () => {
      const result = await getCharacterDetails(characterId);
      if (result.error) throw result.error;
      return result.data;
    },
    enabled: !!characterId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  
  const messagesQuery = useOptimizedChatMessages(chatId);
  const sendMessageMutation = useOptimizedSendMessage();
  
  // Memoized message processing
  const allMessages = useMemo(() => {
    return messagesQuery.data?.pages?.flatMap(page => page.messages) || [];
  }, [messagesQuery.data?.pages]);
  
  // Context extraction from messages
  const mostRecentContext = useMemo(() => {
    if (!allMessages.length) return state.trackedContext;
    
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const message = allMessages[i];
      if (!message.isUser && message.current_context) {
        return message.current_context;
      }
    }
    
    return state.trackedContext;
  }, [allMessages, state.trackedContext]);
  
  // Update context when messages change
  useEffect(() => {
    if (mostRecentContext !== state.trackedContext) {
      dispatch({ type: 'UPDATE_CONTEXT', payload: mostRecentContext });
    }
  }, [mostRecentContext, state.trackedContext]);
  
  // Optimized send message handler
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
      
      if (result?.updatedContext) {
        dispatch({ type: 'UPDATE_CONTEXT', payload: result.updatedContext });
      }
      
      return result;
      
    } catch (error) {
      dispatch({ type: 'SET_TYPING', payload: false });
      throw error;
    }
  }, [user, chatId, creditsBalance, state.trackedContext, sendMessageMutation, characterId]);
  
  // Stop typing when AI responds
  useEffect(() => {
    if (!state.isTyping || !allMessages.length) return;
    
    const latestMessage = allMessages[allMessages.length - 1];
    if (latestMessage && !latestMessage.isUser) {
      dispatch({ type: 'SET_TYPING', payload: false });
    }
  }, [allMessages, state.isTyping]);
  
  return {
    // State
    messages: allMessages,
    isTyping: state.isTyping,
    trackedContext: state.trackedContext,
    
    // Data
    creditsBalance,
    characterDetails,
    
    // Query states
    isLoading: messagesQuery.isLoading,
    error: messagesQuery.error,
    hasNextPage: messagesQuery.hasNextPage,
    isFetchingNextPage: messagesQuery.isFetchingNextPage,
    
    // Actions
    sendMessage: handleSendMessage,
    fetchNextPage: messagesQuery.fetchNextPage,
    dispatch,
    
    // Utilities
    refetch: messagesQuery.refetch,
    invalidateMessages: () => queryClient.invalidateQueries({ queryKey: ['chat', 'messages', chatId] }),
  };
};

// Performance monitoring hook
export const useChatPerformance = (chatId: string | null) => {
  const [metrics, setMetrics] = useState({
    avgResponseTime: 0,
    messageCount: 0,
    lastResponseTime: 0,
    errorRate: 0
  });
  
  useEffect(() => {
    if (!chatId) return;
    
    const savedMetrics = localStorage.getItem(`chat-metrics-${chatId}`);
    if (savedMetrics) {
      setMetrics(JSON.parse(savedMetrics));
    }
  }, [chatId]);
  
  const updateMetrics = useCallback((responseTime: number, isError: boolean = false) => {
    setMetrics(prev => {
      const newMetrics = {
        ...prev,
        messageCount: prev.messageCount + 1,
        lastResponseTime: responseTime,
        avgResponseTime: ((prev.avgResponseTime * prev.messageCount) + responseTime) / (prev.messageCount + 1),
        errorRate: isError ? (prev.errorRate + 1) / (prev.messageCount + 1) : prev.errorRate
      };
      
      if (chatId) {
        localStorage.setItem(`chat-metrics-${chatId}`, JSON.stringify(newMetrics));
      }
      
      return newMetrics;
    });
  }, [chatId]);
  
  return { metrics, updateMetrics };
};