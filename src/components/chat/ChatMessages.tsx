import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { Message, TrackedContext } from '@/types/chat';
import { MessageGroup } from './MessageGroup';
import { groupMessages } from '@/utils/messageGrouping';
import { ContextDisplay } from './ContextDisplay';
import { useUserGlobalChatSettings } from '@/queries/chatSettingsQueries';
import OptimizedMessageFormatter from './OptimizedMessageFormatter';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FormattedMessage } from "@/components/ui/FormattedMessage";

interface Character {
  id: string;
  name: string;
  tagline: string;
  avatar: string;
  fallback: string;
}

interface ChatMessagesProps {
  chatId: string | null;
  character: Character;
  trackedContext?: TrackedContext;
  streamingMessage?: string;
  isStreaming?: boolean;
  // Props that should come from parent ChatInterface (using the hook)
  messages?: Message[];
  hasMore?: boolean;
  isFetchingNextPage?: boolean;
  isLoadingMessages?: boolean;
  fetchNextPage?: () => void;
  isRealtimeConnected?: boolean;
  debugInfo?: string[];
}

const ChatMessages = ({ 
  chatId, 
  character, 
  trackedContext, 
  streamingMessage, 
  isStreaming,
  messages = [],
  hasMore = false,
  isFetchingNextPage = false,
  isLoadingMessages = false,
  fetchNextPage,
  isRealtimeConnected = false,
  debugInfo = []
}: ChatMessagesProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [backgroundImage, setBackgroundImage] = React.useState<string | null>(null);
  
  // Messages should be passed from parent ChatInterface to avoid duplicate hook usage
  
  // Load addon settings for context filtering
  const { data: globalSettings } = useUserGlobalChatSettings();

  // Load background image for current chat
  useEffect(() => {
    if (chatId) {
      const savedBackground = localStorage.getItem(`chat-background-${chatId}`);
      setBackgroundImage(savedBackground);
    } else {
      setBackgroundImage(null);
    }
  }, [chatId]);

  // Listen for background image updates from configuration
  useEffect(() => {
    const handleBackgroundUpdate = (event: CustomEvent) => {
      const { chatId: eventChatId, backgroundImage: newBackground } = event.detail;
      if (eventChatId === chatId) {
        setBackgroundImage(newBackground);
      }
    };

    window.addEventListener('background-image-updated', handleBackgroundUpdate as EventListener);
    
    return () => {
      window.removeEventListener('background-image-updated', handleBackgroundUpdate as EventListener);
    };
  }, [chatId]);

  // Use tracked context as the primary source (real-time from database), fall back to message context
  const contextToUse = React.useMemo(() => {
    // PRIORITY 1: Check tracked context from database (real-time updated)
    if (trackedContext) {
      const hasValidTrackedContext = Object.values(trackedContext).some(
        value => value && value !== 'No context'
      );
      if (hasValidTrackedContext) {
        console.log('💾 Using tracked context from database (PRIORITY 1):', trackedContext);
        return trackedContext;
      }
    }
    
    // PRIORITY 2: Fall back to context from messages if database context is empty
    if (messages.length > 0) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (!message.isUser && message.current_context) {
          const messageContext = message.current_context;
          // Check if message context has valid values (not just "No context")
          const hasValidMessageContext = Object.values(messageContext).some(
            value => value && value !== 'No context'
          );
          if (hasValidMessageContext) {
            console.log('📨 Using context from message (PRIORITY 2):', messageContext);
            return messageContext;
          }
        }
      }
    }
    
    // PRIORITY 3: Default to tracked context structure even if all values are "No context"
    return trackedContext || {
      moodTracking: 'No context',
      clothingInventory: 'No context',
      locationTracking: 'No context',
      timeAndWeather: 'No context',
      relationshipStatus: 'No context',
      characterPosition: 'No context'
    };
  }, [trackedContext, messages]);

  // ✅ SIMPLIFIED: Basic message grouping without complex streaming logic
  const messageGroups = useMemo(() => {
    // ✅ SIMPLIFIED: No frontend streaming message display
    // Backend handles all message persistence, frontend just shows database messages
    return groupMessages(messages as any);
  }, [messages]);

  // ✅ PHASE 3: Memoized scroll handler to prevent recreation
  const handleLoadEarlier = useCallback(() => {
    if (hasMore && !isFetchingNextPage && fetchNextPage) {
      const currentScrollHeight = messagesContainerRef.current?.scrollHeight || 0;
      
      fetchNextPage();
      
      setTimeout(() => {
        if (messagesContainerRef.current) {
          const newScrollHeight = messagesContainerRef.current.scrollHeight;
          const scrollDiff = newScrollHeight - currentScrollHeight;
          messagesContainerRef.current.scrollTop = scrollDiff;
        }
      }, 100);
    }
  }, [hasMore, isFetchingNextPage, fetchNextPage]);

  // ✅ PHASE 3: Optimized auto-scroll with better performance
  useEffect(() => {
    const shouldAutoScroll = () => {
      if (isLoadingMessages && messages.length === 0) return false;
      return messages.length > 0 || (isStreaming && streamingMessage);
    };

    if (shouldAutoScroll()) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ 
          behavior: isLoadingMessages ? 'auto' : 'smooth', 
          block: 'end' 
        });
      });
    }
  }, [messages.length, isStreaming, streamingMessage, isLoadingMessages]);

  // Show empty state when no chat is selected
  if (!chatId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-400">
          <p className="text-lg">Start a conversation with {character.name}</p>
          <p className="text-sm mt-2">Send a message below to begin</p>
        </div>
      </div>
    );
  }

  if (isLoadingMessages) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading messages...
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={messagesContainerRef}
      className="flex-1 overflow-y-auto p-6 space-y-6 font-['Open_Sans',_sans-serif] relative chat-messages-container"
      style={{
        backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Background overlay for better readability */}
      {backgroundImage && (
        <div className="absolute inset-0 bg-black/50 pointer-events-none" />
      )}
      <div className="relative z-10">
      {/* Load Earlier Messages Button */}
      {hasMore && (
        <div className="flex justify-center mb-4">
          <Button
            onClick={handleLoadEarlier}
            disabled={isFetchingNextPage}
            variant="outline"
            className="text-sm"
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading...
              </>
            ) : (
              'Load Earlier Messages'
            )}
          </Button>
        </div>
      )}

      {/* Message Groups */}
      {messageGroups.length > 0 ? (
        messageGroups.map(group => (
          <MessageGroup 
            key={group.id} 
            group={group} 
            character={character}
            trackedContext={contextToUse}
            addonSettings={(() => {
              const settings = globalSettings ? {
                moodTracking: globalSettings.mood_tracking,
                clothingInventory: globalSettings.clothing_inventory,
                locationTracking: globalSettings.location_tracking,
                timeAndWeather: globalSettings.time_and_weather,
                relationshipStatus: globalSettings.relationship_status,
                characterPosition: globalSettings.character_position,
              } : {
                // Default to all enabled while loading to ensure context displays
                moodTracking: true,
                clothingInventory: true,
                locationTracking: true,
                timeAndWeather: true,
                relationshipStatus: true,
                characterPosition: true,
              };
              
              return settings;
            })()}
          />
        ))
      ) : (
        // Show empty state for chat with no messages yet
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-gray-400">
            <p className="text-lg">Your conversation with {character.name} will appear here</p>
            <p className="text-sm mt-2">Send your first message to get started!</p>
          </div>
        </div>
      )}

      {/* Messages are already integrated with streaming via the hook */}
      <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ChatMessages;