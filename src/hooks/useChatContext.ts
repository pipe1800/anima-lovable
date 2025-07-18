import { useMemo, useRef } from 'react';
import type { Message, TrackedContext } from '@/types/chat';

/**
 * Hook for extracting and managing chat context from messages
 * Handles context tracking and updates from AI responses
 */
export const useChatContext = (
  messages: Message[], 
  initialContext: TrackedContext
) => {
  // Track last logged context to prevent spam
  const lastLoggedRef = useRef<string>('');

  // Extract the most recent context from AI messages
  const mostRecentContext = useMemo(() => {
    if (!messages.length) {
      return initialContext;
    }
    
    // Look for the most recent AI message with context data
    // Start from the most recent and work backwards
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!message.isUser && message.current_context) {
        // Only log once per unique message to avoid spam
        const messageKey = `${message.id}-${JSON.stringify(message.current_context)}`;
        if (lastLoggedRef.current !== messageKey) {
          console.log('📨 Found context in message:', {
            messageId: message.id,
            context: message.current_context,
            timestamp: message.timestamp
          });
          lastLoggedRef.current = messageKey;
        }
        
        // Ensure we have all required context fields with fallbacks
        const contextWithDefaults = {
          moodTracking: message.current_context.moodTracking || initialContext.moodTracking || 'No context',
          clothingInventory: message.current_context.clothingInventory || initialContext.clothingInventory || 'No context',
          locationTracking: message.current_context.locationTracking || initialContext.locationTracking || 'No context',
          timeAndWeather: message.current_context.timeAndWeather || initialContext.timeAndWeather || 'No context',
          relationshipStatus: message.current_context.relationshipStatus || initialContext.relationshipStatus || 'No context',
          characterPosition: message.current_context.characterPosition || initialContext.characterPosition || 'No context'
        };
        
        return contextWithDefaults;
      }
    }
    
    return initialContext;
  }, [
    // More stable dependencies - only recalculate when the actual message content changes
    messages.map(m => `${m.id}-${m.isUser}-${JSON.stringify(m.current_context)}`).join(','),
    JSON.stringify(initialContext)
  ]);

  // Check if context has actually changed from initial
  const hasContextUpdates = useMemo(() => {
    return mostRecentContext !== initialContext && (
      mostRecentContext.moodTracking !== initialContext.moodTracking ||
      mostRecentContext.clothingInventory !== initialContext.clothingInventory ||
      mostRecentContext.locationTracking !== initialContext.locationTracking ||
      mostRecentContext.timeAndWeather !== initialContext.timeAndWeather ||
      mostRecentContext.relationshipStatus !== initialContext.relationshipStatus ||
      mostRecentContext.characterPosition !== initialContext.characterPosition
    );
  }, [mostRecentContext, initialContext]);

  return {
    currentContext: mostRecentContext,
    hasContextUpdates
  };
};
