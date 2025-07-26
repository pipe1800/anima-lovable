import { useReducer, useCallback, useEffect, useRef, useMemo } from 'react';
import { useMutation, useQueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getCharacterDetails } from '@/lib/supabase-queries';
import { handleChatError } from '@/utils/chatErrorHandling';
import { queryConfigs, infiniteQueryConfigs, invalidationHelpers, queryKeys } from '@/queries/chatQueries';
import { useUserGlobalChatSettings } from '@/queries/chatSettingsQueries';
import type { Message, TrackedContext, ChatState, ChatAction } from '@/types/chat';

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
          // ✅ SIMPLIFIED: Basic real-time conflict prevention
          if (isStreamingRef.current) {
            addDebugInfo('Skipping real-time update - streaming active');
            return;
          }
          
          if (payload.new.is_placeholder || !payload.new.content?.trim()) {
            addDebugInfo('Skipping empty/placeholder message');
            return;
          }
          
          addDebugInfo(`New message: ${payload.new.is_ai_message ? 'AI' : 'User'}`);
          
          // ✅ SIMPLIFIED: Single invalidation with minimal delay
          setTimeout(() => {
            queryClient.invalidateQueries({ 
              queryKey: queryKeys.chat.messages(chatId),
              exact: true 
            });
            addDebugInfo('Real-time query invalidated');
          }, 100); // Single, consistent delay
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
            queryClient.invalidateQueries({ 
              queryKey: queryKeys.chat.messages(chatId),
              exact: true 
            });
            addDebugInfo('Real-time context update invalidated');
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
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rclpyipeytqbamiwcuih.supabase.co';
      
      const response = await fetch(`${supabaseUrl}/functions/v1/chat-management`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjbHB5aXBleXRxYmFtaXdjdWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE3NDY0MjAsImV4cCI6MjA2NzMyMjQyMH0.D6IvUZBtLF5MdBGA2Re-1UMEc6bGaT2JhP0V1JuU_KU',
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
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available for streaming response');
      }
      
      let fullMessage = '';
      const decoder = new TextDecoder();
      
      if (streamingMode === 'instant') {
        // INSTANT MODE: Consume stream in background, show complete message at end
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                
                // Check for new completion format with metadata first
                try {
                  const completionData = JSON.parse(data);
                  if (completionData.done === true) {
                    console.log('🏁 Instant mode - Stream completed');
                    
                    isStreamingRef.current = false;
                    
                    // Check for context ceiling warning
                    if (completionData.metadata?.contextCeilingReached) {
                      console.log('⚠️ Context ceiling reached, emitting warning');
                      // Emit context ceiling event
                      window.dispatchEvent(new CustomEvent('contextCeilingReached', {
                        detail: {
                          droppedMessages: completionData.metadata.droppedMessages,
                          tokenUsage: completionData.metadata.tokenUsage
                        }
                      }));
                    }
                    
                    // Clear streaming state and refresh to show complete message
                    dispatch({
                      type: 'SET_STREAMING',
                      payload: { isStreaming: false, message: '' }
                    });
                    
                    // Refresh messages to show final result
                    queryClient.invalidateQueries({ 
                      queryKey: queryKeys.chat.messages(chatId),
                      exact: true 
                    });
                    
                    // Context fetching logic...
                    setTimeout(async () => {
                      try {
                        const { data: contextData, error } = await supabase
                          .from('chat_context')
                          .select('current_context')
                          .eq('chat_id', chatId)
                          .eq('user_id', user.id)
                          .eq('character_id', characterId)
                          .maybeSingle();
                        
                        if (!error && contextData?.current_context) {
                          console.log('✅ Fresh context fetched:', contextData.current_context);
                          
                          const rawContext = contextData.current_context as any;
                          const convertedContext = {
                            moodTracking: rawContext?.mood || 'No context',
                            clothingInventory: rawContext?.clothing || 'No context',
                            locationTracking: rawContext?.location || 'No context',
                            timeAndWeather: rawContext?.time_weather || 'No context',
                            relationshipStatus: rawContext?.relationship || 'No context',
                            characterPosition: rawContext?.character_position || 'No context'
                          };
                          
                          dispatch({ type: 'UPDATE_CONTEXT', payload: convertedContext });
                          console.log('🎯 Context updated in UI immediately!');
                        }
                      } catch (err) {
                        console.error('❌ Failed to fetch fresh context:', err);
                      }
                    }, 1000);
                    
                    const endTime = Date.now();
                    return { content: fullMessage };
                  }
                } catch (parseError) {
                  // Not JSON or not completion format, try legacy format
                }
                
                if (data === '[DONE]') {
                  console.log('🏁 Instant mode - Stream completed (legacy)');
                  
                  isStreamingRef.current = false;
                  
                  // Clear streaming state and refresh to show complete message
                  dispatch({
                    type: 'SET_STREAMING',
                    payload: { isStreaming: false, message: '' }
                  });
                  
                  // Refresh messages to show final result
                  queryClient.invalidateQueries({ 
                    queryKey: queryKeys.chat.messages(chatId),
                    exact: true 
                  });
                  
                  // 🎯 SIMPLE CONTEXT FETCH - AI message completed, get fresh context
                  console.log('🔄 AI message completed, fetching fresh context...');
                  setTimeout(async () => {
                    try {
                      const { data: contextData, error } = await supabase
                        .from('chat_context')
                        .select('current_context')
                        .eq('chat_id', chatId)
                        .eq('user_id', user.id)
                        .eq('character_id', characterId)
                        .maybeSingle();
                      
                      if (!error && contextData?.current_context) {
                        console.log('✅ Fresh context fetched:', contextData.current_context);
                        
                        // Cast to expected context format
                        const rawContext = contextData.current_context as any;
                        
                        // Convert to frontend format
                        const convertedContext = {
                          moodTracking: rawContext?.mood || 'No context',
                          clothingInventory: rawContext?.clothing || 'No context',
                          locationTracking: rawContext?.location || 'No context',
                          timeAndWeather: rawContext?.time_weather || 'No context',
                          relationshipStatus: rawContext?.relationship || 'No context',
                          characterPosition: rawContext?.character_position || 'No context'
                        };
                        
                        // Update the context state
                        dispatch({ type: 'UPDATE_CONTEXT', payload: convertedContext });
                        console.log('🎯 Context updated in UI immediately!');
                      }
                    } catch (err) {
                      console.error('❌ Failed to fetch fresh context:', err);
                    }
                  }, 1000); // 1 second delay for backend processing
                  
                  const endTime = Date.now();
                  return { content: fullMessage };
                }
                
                // Consume content but don't display until complete
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.choices?.[0]?.delta?.content) {
                    fullMessage += parsed.choices[0].delta.content;
                  }
                } catch (e) {
                  // Skip invalid JSON chunks
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
        
      } else {
        // SMOOTH MODE: Real-time character-by-character streaming
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                
                // Check for new completion format with metadata first
                try {
                  const completionData = JSON.parse(data);
                  if (completionData.done === true) {
                    console.log('🏁 Smooth mode - Stream completed');
                    
                    isStreamingRef.current = false;
                    
                    // Check for context ceiling warning
                    if (completionData.metadata?.contextCeilingReached) {
                      console.log('⚠️ Context ceiling reached, emitting warning');
                      // Emit context ceiling event
                      window.dispatchEvent(new CustomEvent('contextCeilingReached', {
                        detail: {
                          droppedMessages: completionData.metadata.droppedMessages,
                          tokenUsage: completionData.metadata.tokenUsage
                        }
                      }));
                    }
                    
                    // Clear streaming state and refresh to show final message
                    dispatch({
                      type: 'SET_STREAMING',
                      payload: { isStreaming: false, message: '' }
                    });
                    
                    // Refresh messages to get the final database message
                    queryClient.invalidateQueries({ 
                      queryKey: queryKeys.chat.messages(chatId),
                      exact: true 
                    });
                    
                    // Context fetching logic...
                    setTimeout(async () => {
                      try {
                        const { data: contextData, error } = await supabase
                          .from('chat_context')
                          .select('current_context')
                          .eq('chat_id', chatId)
                          .eq('user_id', user.id)
                          .eq('character_id', characterId)
                          .maybeSingle();
                        
                        if (!error && contextData?.current_context) {
                          console.log('✅ Fresh context fetched:', contextData.current_context);
                          
                          const rawContext = contextData.current_context as any;
                          const convertedContext = {
                            moodTracking: rawContext?.mood || 'No context',
                            clothingInventory: rawContext?.clothing || 'No context',
                            locationTracking: rawContext?.location || 'No context',
                            timeAndWeather: rawContext?.time_weather || 'No context',
                            relationshipStatus: rawContext?.relationship || 'No context',
                            characterPosition: rawContext?.character_position || 'No context'
                          };
                          
                          dispatch({ type: 'UPDATE_CONTEXT', payload: convertedContext });
                          console.log('🎯 Context updated in UI immediately!');
                        }
                      } catch (err) {
                        console.error('❌ Failed to fetch fresh context:', err);
                      }
                    }, 1000);
                    
                    const endTime = Date.now();
                    return { content: fullMessage };
                  }
                } catch (parseError) {
                  // Not JSON or not completion format, try legacy format or streaming content
                }
                
                if (data === '[DONE]') {
                  console.log('🏁 Smooth mode - Stream completed (legacy)');
                  
                  isStreamingRef.current = false;
                  
                  // Clear streaming state and refresh to show final message
                  dispatch({
                    type: 'SET_STREAMING',
                    payload: { isStreaming: false, message: '' }
                  });
                  
                  // Refresh messages to get the final database message
                  queryClient.invalidateQueries({ 
                    queryKey: queryKeys.chat.messages(chatId),
                    exact: true 
                  });
                  
                  // 🎯 SIMPLE CONTEXT FETCH - AI message completed, get fresh context
                  console.log('🔄 AI message completed (smooth mode), fetching fresh context...');
                  setTimeout(async () => {
                    try {
                      const { data: contextData, error } = await supabase
                        .from('chat_context')
                        .select('current_context')
                        .eq('chat_id', chatId)
                        .eq('user_id', user.id)
                        .eq('character_id', characterId)
                        .maybeSingle();
                      
                      if (!error && contextData?.current_context) {
                        console.log('✅ Fresh context fetched:', contextData.current_context);
                        
                        // Cast to expected context format
                        const rawContext = contextData.current_context as any;
                        
                        // Convert to frontend format
                        const convertedContext = {
                          moodTracking: rawContext?.mood || 'No context',
                          clothingInventory: rawContext?.clothing || 'No context',
                          locationTracking: rawContext?.location || 'No context',
                          timeAndWeather: rawContext?.time_weather || 'No context',
                          relationshipStatus: rawContext?.relationship || 'No context',
                          characterPosition: rawContext?.character_position || 'No context'
                        };
                        
                        // Update the context state
                        dispatch({ type: 'UPDATE_CONTEXT', payload: convertedContext });
                        console.log('🎯 Context updated in UI immediately!');
                      }
                    } catch (err) {
                      console.error('❌ Failed to fetch fresh context:', err);
                    }
                  }, 1000); // 1 second delay for backend processing
                  
                  // 🎯 SIMPLE CONTEXT FETCH - AI message completed, get fresh context
                  console.log('🔄 AI message completed (smooth mode), fetching fresh context...');
                  setTimeout(async () => {
                    try {
                      const { data: contextData, error } = await supabase
                        .from('chat_context')
                        .select('current_context')
                        .eq('chat_id', chatId)
                        .eq('user_id', user.id)
                        .eq('character_id', characterId)
                        .maybeSingle();
                      
                      if (!error && contextData?.current_context) {
                        console.log('✅ Fresh context fetched:', contextData.current_context);
                        
                        // Cast to expected context format
                        const rawContext = contextData.current_context as any;
                        
                        // Convert to frontend format
                        const convertedContext = {
                          moodTracking: rawContext?.mood || 'No context',
                          clothingInventory: rawContext?.clothing || 'No context',
                          locationTracking: rawContext?.location || 'No context',
                          timeAndWeather: rawContext?.time_weather || 'No context',
                          relationshipStatus: rawContext?.relationship || 'No context',
                          characterPosition: rawContext?.character_position || 'No context'
                        };
                        
                        // Update the context state
                        dispatch({ type: 'UPDATE_CONTEXT', payload: convertedContext });
                        console.log('🎯 Context updated in UI immediately!');
                      }
                    } catch (err) {
                      console.error('❌ Failed to fetch fresh context:', err);
                    }
                  }, 1000); // 1 second delay for backend processing
                  
                  const endTime = Date.now();
                  return { content: fullMessage };
                }
                
                // Real-time streaming display
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.choices?.[0]?.delta?.content) {
                    const content = parsed.choices[0].delta.content;
                    fullMessage += content;
                    
                    // Update streaming message
                    dispatch({
                      type: 'SET_STREAMING',
                      payload: { isStreaming: true, message: fullMessage }
                    });
                    
                    // Add small delay for smooth streaming experience
                    await new Promise(resolve => setTimeout(resolve, 50));
                  }
                } catch (e) {
                  // Skip invalid JSON chunks
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
      
      return { content: fullMessage };
      
    } catch (error) {
      isStreamingRef.current = false;
      console.error('Streaming error:', error);
      throw error;
    }
  };

  // Send message mutation
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
      
      // Add optimistic user message
      const optimisticId = `user-optimistic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      queryClient.setQueryData(queryKeys.chat.messages(chatId), (old: any) => {
        let nextMessageOrder = 1;
        if (old?.pages?.length) {
          const allMessages = old.pages.flatMap((page: any) => page.messages);
          const maxOrder = Math.max(...allMessages.map((msg: any) => msg.message_order || 0));
          nextMessageOrder = maxOrder + 1;
        }

        if (!old?.pages?.length) {
          return {
            pages: [{
              messages: [{
                id: optimisticId,
                content,
                isUser: true,
                timestamp: new Date(),
                status: 'sending' as const,
                message_order: nextMessageOrder
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
          status: 'sending',
          message_order: nextMessageOrder
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
        // Call unified chat-management function for streaming
        const aiResult = await invokeStreamingAI(chatId, content, characterId, user.id, trackedContext, addonSettings, selectedPersonaId, selectedWorldInfoId);
        
        // ✅ SIMPLIFIED: Single invalidation after completion
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.chat.messages(chatId),
          exact: true 
        });
        
        const endTime = Date.now();
        return { 
          chatId, 
          content,
          optimisticId,
          updatedContext: aiResult,
          metrics: { sendTime: endTime - startTime }
        };
        
      } catch (error) {
        // ✅ SIMPLIFIED: Single invalidation on error for consistency
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.chat.messages(chatId),
          exact: true 
        });
        throw error;
      }
    },
    onSuccess: () => {
      if (user) {
        queryClient.invalidateQueries({ queryKey: queryKeys.user.credits(user.id) });
      }
    },
  });

  // ============================================================================
  // COMBINED MESSAGE LIST WITH OPTIMISTIC CLEANUP
  // ============================================================================
  const allMessages = useMemo(() => {
    const dbMessages = messagesQuery.data?.pages?.flatMap(page => page.messages) || [];
    
    // Simple sorting by message_order
    const sortedMessages = dbMessages.sort((a, b) => {
      return (a.message_order || 0) - (b.message_order || 0);
    });

    return sortedMessages;
  }, [messagesQuery.data?.pages]);

  // Extract context from messages
  const extractedContext = useMemo(() => {
    if (!allMessages.length) {
      return state.trackedContext;
    }
    
    // Find most recent AI message with context
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const message = allMessages[i];
      if (!message.isUser && message.current_context) {
        return message.current_context;
      }
    }
    
    return state.trackedContext;
  }, [allMessages, state.trackedContext]);

  // Update context when extracted context changes
  useEffect(() => {
    if (extractedContext !== state.trackedContext) {
      console.log('🔄 useChatUnified: Updating context:', {
        from: state.trackedContext,
        to: extractedContext
      });
      dispatch({ type: 'UPDATE_CONTEXT', payload: extractedContext });
    }
  }, [extractedContext, state.trackedContext]);

  // ============================================================================
  // SEND MESSAGE HANDLER
  // ============================================================================
  const handleSendMessage = useCallback(async (
    content: string, 
    addonSettings?: any,
    selectedPersonaId?: string | null,
    selectedWorldInfoId?: string | null,
    overrideContext?: any
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
        trackedContext: overrideContext || state.trackedContext,
        addonSettings,
        selectedPersonaId,
        selectedWorldInfoId
      });
      
      return result;
    } catch (error) {
      console.error('Send message error:', error);
      handleChatError(error, 'Failed to send message');
      throw error;
    } finally {
      dispatch({ type: 'SET_TYPING', payload: false });
    }
  }, [user, chatId, characterId, sendMessageMutation, state.trackedContext, creditsBalance]);

  // ============================================================================
  // RETURN UNIFIED INTERFACE
  // ============================================================================
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
      messageCount: allMessages.length,
      connectionStatus: state.isRealtimeConnected ? 'connected' : 'disconnected',
      lastActivity: state.lastActivity
    }
  };
};
