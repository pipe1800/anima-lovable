import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Message, TrackedContext, ChatAction } from '@/types/chat';

/**
 * Hook for handling chat message streaming with AI responses
 * Manages optimistic updates, streaming, and message saving
 */
export const useChatStreaming = (
  dispatch?: React.Dispatch<ChatAction>, 
  isStreamingRef?: React.MutableRefObject<boolean>
) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // AI invocation function with streaming support
  const invokeStreamingAI = async (
    chatId: string, 
    userMessage: string, 
    characterId: string, 
    userId: string,
    trackedContext?: TrackedContext,
    addonSettings?: any,
    selectedPersonaId?: string | null
  ) => {
    const startTime = Date.now();
    
    // Set streaming flag to prevent real-time conflicts
    if (isStreamingRef) {
      isStreamingRef.current = true;
    }
    
    try {
      // Get fresh session
      console.log('🔄 Getting fresh session for streaming...');
      
      const { data: currentUser } = await supabase.auth.getUser();
      if (!currentUser?.user) {
        throw new Error('Authentication failed: Please sign in again');
      }
      
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) {
        throw new Error('Authentication failed: Please sign in again');
      }

      let session = sessionData.session;

      // Check token expiration
      const now = Math.floor(Date.now() / 1000);
      const tokenBuffer = 30;
      
      if (session.expires_at && session.expires_at <= (now + tokenBuffer)) {
        console.log('Token expired, refreshing...');
        
        const { data: refreshResult, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError || !refreshResult.session) {
          console.error('Failed to refresh session:', refreshError);
          await supabase.auth.signOut();
          throw new Error('Authentication failed: Please sign in again');
        }
        
        session = refreshResult.session;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const requestPayload = {
        chatId,
        message: userMessage,
        characterId,
        addonSettings,
        selectedPersonaId
      };
      
      // ✅ FIX: Prevent multiple streaming instances
      if (dispatch) {
        dispatch({
          type: 'SET_STREAMING',
          payload: { isStreaming: true, message: '' }
        });
      }
      
      // Make streaming request
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rclpyipeytqbamiwcuih.supabase.co';
      
      const response = await fetch(`${supabaseUrl}/functions/v1/chat-stream`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjbHB5aXBleXRxYmFtaXdjdWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE3NDY0MjAsImV4cCI6MjA2NzMyMjQyMH0.D6IvUZBtLF5MdBGA2Re-1UMEc6bGaT2JhP0V1JuU_KU',
          'x-client-info': 'anima-chat-web',
        },
        body: JSON.stringify(requestPayload),
      });
      
      if (!response.ok) {
        // Stop streaming state on error
        if (dispatch) {
          dispatch({
            type: 'SET_STREAMING',
            payload: { isStreaming: false, message: '' }
          });
        }
        
        const errorText = await response.text();
        if (response.status === 401) {
          throw new Error('Authentication failed: Please sign in again');
        } else if (response.status === 402) {
          throw new Error('Insufficient credits');
        } else {
          throw new Error(`Request failed: ${response.status} - ${errorText || 'Unknown error'}`);
        }
      }
      
      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available for streaming response');
      }
      
      let fullMessage = '';
      const decoder = new TextDecoder();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                // ✅ FIX: Don't clear streaming state immediately to prevent flickering
                // Keep the streaming message visible until database message appears
                console.log('🔄 Stream completed, keeping message visible until database sync...');
                
                // Clear streaming flag but keep the message visible
                if (isStreamingRef) {
                  isStreamingRef.current = false;
                }
                
                // ✅ FIX: Staggered invalidation - immediate for fast sync
                queryClient.invalidateQueries({ 
                  queryKey: ['chat', 'messages', chatId],
                  exact: true 
                });
                
                // ✅ FIX: Auto-clear streaming state after a short delay if no DB message appears
                setTimeout(() => {
                  if (dispatch) {
                    dispatch({
                      type: 'SET_STREAMING',
                      payload: { isStreaming: false, message: '' }
                    });
                  }
                }, 2000); // 2 second safety timeout
                
                const endTime = Date.now();
                console.log(`Streaming completed in ${endTime - startTime}ms`);
                return { content: fullMessage };
              }
              
              try {
                const parsed = JSON.parse(data);
                if (parsed.choices?.[0]?.delta?.content) {
                  const content = parsed.choices[0].delta.content;
                  fullMessage += content;
                  
                  // ✅ FIX: Update streaming state with current content for real-time display
                  if (dispatch) {
                    dispatch({
                      type: 'SET_STREAMING',
                      payload: { isStreaming: true, message: fullMessage }
                    });
                  }
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
      
      return { content: fullMessage };
      
    } catch (error) {
      // ✅ FIX: Always clear streaming state on error
      if (isStreamingRef) {
        isStreamingRef.current = false;
      }
      if (dispatch) {
        dispatch({
          type: 'SET_STREAMING',
          payload: { isStreaming: false, message: '' }
        });
      }
      console.error('Streaming error:', error);
      throw error;
    }
  };

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
      
      const startTime = Date.now();
      
      // Add optimistic user message for immediate feedback
      const optimisticId = `user-optimistic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      queryClient.setQueryData(['chat', 'messages', chatId], (old: any) => {
        // Calculate the next message_order based on existing messages
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
        // Call streaming function - backend handles user message saving
        const aiResult = await invokeStreamingAI(chatId, content, characterId, user.id, trackedContext, addonSettings, selectedPersonaId);
        
        // Don't remove optimistic message here - let the orchestrator cleanup handle it
        // when the real database message appears. This prevents flickering.
        
        // Backend saves both user message and AI response, so refresh the data
        queryClient.invalidateQueries({ 
          queryKey: ['chat', 'messages', chatId],
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
        // On error, just refresh to ensure consistency
        // Don't remove optimistic message manually to avoid flickering
        queryClient.invalidateQueries({ 
          queryKey: ['chat', 'messages', chatId],
          exact: true 
        });
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'credits', user?.id] });
    },
  });
};
