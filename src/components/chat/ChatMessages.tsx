import React, { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { Message, TrackedContext } from '@/types/chat';
import { MessageGroup } from './MessageGroup';
import { groupMessages } from '@/utils/messageGrouping';
import { ContextDisplay } from './ContextDisplay';
import { useAddonSettings } from './useAddonSettings';
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
  // const { ... } = useOptimizedChat(chatId, character.id); // REMOVED - conflicts with parent hook
  
  // Load addon settings for context filtering
  const { data: addonSettings } = useAddonSettings(character.id);

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

  // Extract most recent context from AI messages
  const mostRecentContext = React.useMemo(() => {
    if (!messages.length) return trackedContext;
    
    // Find the most recent AI message with context
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!message.isUser && message.current_context) {
        return message.current_context;
      }
    }
    
    return trackedContext;
  }, [messages, trackedContext]);

  // Group messages for better visual organization
  const messageGroups = React.useMemo(() => {
    return groupMessages(messages);
  }, [messages]);

  // Consolidated smart auto-scroll effect with better timing
  useEffect(() => {
    const shouldAutoScroll = () => {
      // Don't scroll during initial loading unless we have messages
      if (isLoadingMessages && messages.length === 0) return false;
      
      // Always scroll for new messages (debounced)
      if (messages.length > 0) return true;
      
      // Scroll during streaming
      if (isStreaming && streamingMessage) return true;
      
      return false;
    };

    if (shouldAutoScroll()) {
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        const behavior = isLoadingMessages ? 'auto' : 'smooth';
        messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
      });
    }
  }, [messages.length, isStreaming, streamingMessage, isLoadingMessages]);

  const handleLoadEarlier = () => {
    if (hasMore && !isFetchingNextPage && fetchNextPage) {
      const currentScrollHeight = messagesContainerRef.current?.scrollHeight || 0;
      
      fetchNextPage();
      
      // Maintain scroll position after loading earlier messages
      setTimeout(() => {
        if (messagesContainerRef.current) {
          const newScrollHeight = messagesContainerRef.current.scrollHeight;
          const scrollDiff = newScrollHeight - currentScrollHeight;
          messagesContainerRef.current.scrollTop = scrollDiff;
        }
      }, 100);
    }
  };

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
      className="flex-1 overflow-y-auto p-6 space-y-6 font-['Open_Sans',_sans-serif] relative"
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
            trackedContext={mostRecentContext}
            addonSettings={addonSettings}
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