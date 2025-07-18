import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TrackedContext } from '@/types/chat';

export const useContextManagement = (
  chatId: string | null,
  characterId: string,
  userId: string | null
) => {
  const contextRef = useRef<TrackedContext>({
    moodTracking: 'No context',
    clothingInventory: 'No context',
    locationTracking: 'No context',
    timeAndWeather: 'No context',
    relationshipStatus: 'No context',
    characterPosition: 'No context'
  });

  const loadContext = useCallback(async () => {
    if (!chatId || !userId) return;

    const { data } = await supabase
      .from('user_chat_context')
      .select('context_type, current_context')
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .eq('chat_id', chatId);

    if (data) {
      const newContext = { ...contextRef.current };
      
      data.forEach(row => {
        switch (row.context_type) {
          case 'mood':
            newContext.moodTracking = row.current_context || 'No context';
            break;
          case 'clothing':
            newContext.clothingInventory = row.current_context || 'No context';
            break;
          case 'location':
            newContext.locationTracking = row.current_context || 'No context';
            break;
          case 'time_weather':
            newContext.timeAndWeather = row.current_context || 'No context';
            break;
          case 'relationship':
            newContext.relationshipStatus = row.current_context || 'No context';
            break;
          case 'character_position':
            newContext.characterPosition = row.current_context || 'No context';
            break;
        }
      });
      
      contextRef.current = newContext;
    }
  }, [chatId, characterId, userId]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  return {
    context: contextRef.current,
    reloadContext: loadContext
  };
};
