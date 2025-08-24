import { useCallback, useEffect, useState, useRef } from 'react';
import { supabase } from '@/db/client';
import type { TrackedContext } from '@/types/chat';
import { convertDatabaseContextToTrackedContext } from '@/utils/contextConverter';

export const useContextManagement = (
  chatId: string | null,
  characterId: string,
  userId: string | null,
  options?: { enabled?: boolean }
) => {
  const [context, setContext] = useState<TrackedContext>({
    moodTracking: 'No context',
    clothingInventory: 'No context',
    locationTracking: 'No context',
    timeAndWeather: 'No context',
    relationshipStatus: 'No context',
    characterPosition: 'No context',
    enchantmentStatus: 'No context',
    itemInventory: 'No context'
  } as any);
  const [isLoading, setIsLoading] = useState(false);
  const lastLoadedRef = useRef<string>('');

  const enabled = options?.enabled !== false;

  const loadContext = useCallback(async () => {
    if (!enabled) return;
    if (!chatId || !userId || !characterId) {
      return;
    }

    // Prevent duplicate calls
    const callKey = `${chatId}-${userId}-${characterId}`;
    if (lastLoadedRef.current === callKey && !isLoading) {
      return;
    }
    lastLoadedRef.current = callKey;

    setIsLoading(true);
    try {
      // Query chat_context table directly
      const { data: directData, error: directError } = await supabase
        .from('chat_context')
        .select('current_context')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .eq('character_id', characterId)
        .maybeSingle();

      if (directError) {
        console.error('❌ Database error loading context:', directError);
        return;
      }

      if (directData?.current_context) {
        const rawContext = directData.current_context;
        console.log('📥 Raw context loaded from DB:', rawContext);
        
        // Convert database format to frontend format
        const convertedContext = convertDatabaseContextToTrackedContext(rawContext);
        console.log('🔄 Converted context:', convertedContext);
        
        if (convertedContext) {
          setContext(convertedContext);
          console.log('✅ Context updated in state');
        }
      } else {
        console.log('❌ No context data found in database');
      }
    } catch (err) {
      console.error('❌ Context loading error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [chatId, characterId, userId, isLoading]);

  // Set up real-time subscription for context updates with debouncing
  useEffect(() => {
    if (!enabled || !chatId) return;
    
    let debounceTimer: NodeJS.Timeout;
    
    const channel = supabase
      .channel(`context-${chatId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'chat_context',
          filter: `chat_id=eq.${chatId}`
        },
        (payload) => {
          console.log('🔄 Context change detected in chat_context:', payload.eventType, payload.new);
          // Debounce the reload to prevent rapid-fire updates
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            lastLoadedRef.current = ''; // Reset to allow reload
            loadContext();
          }, 300); // Reduced debounce time for faster response
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`
        },
        (payload) => {
          // Check if the message update includes context
          const newMessage = payload.new as any;
          if (newMessage?.current_context) {
            console.log('🔄 Context change detected in message:', newMessage.current_context);
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              lastLoadedRef.current = '';
              loadContext();
            }, 300);
          }
        }
      )
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [chatId, enabled]); // Remove loadContext from dependencies to prevent infinite loop

  // Initial load when parameters change
  useEffect(() => {
    if (enabled) loadContext();
  }, [chatId, characterId, userId, enabled]); // Only reload when these core params change

  return {
    context: context,
    reloadContext: loadContext,
    isLoading
  };
};
