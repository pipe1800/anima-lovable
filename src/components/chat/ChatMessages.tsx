import React, { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useChatMessages, useRealtimeMessages, useMessagePolling } from '@/hooks/useChat';
import type { Message, TrackedContext } from '@/hooks/useChat';
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
}

const ChatMessages = ({ chatId, character, trackedContext, streamingMessage, isStreaming }: ChatMessagesProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [backgroundImage, setBackgroundImage] = React.useState<string | null>(null);
  
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error
  } = useChatMessages(chatId);

  // Enable real-time updates with fallback polling
  const { isSubscribed, debugInfo } = useRealtimeMessages(chatId);
  useMessagePolling(chatId, isSubscribed);
  
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

  // Use only fetched messages from database (single source of truth)
  const allMessages = React.useMemo(() => {
    return data?.pages?.flatMap(page => page.messages) || [];
  }, [data?.pages]);

  // Extract most recent context from AI messages
  const mostRecentContext = React.useMemo(() => {
    if (!allMessages.length) return trackedContext;
    
    // Find the most recent AI message with context
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const message = allMessages[i];
      if (!message.isUser && message.current_context) {
        return message.current_context;
      }
    }
    
    return trackedContext;
  }, [allMessages, trackedContext]);

  // Group messages for better visual organization
  const messageGroups = React.useMemo(() => {
    return groupMessages(allMessages);
  }, [allMessages]);

  // Auto scroll to bottom for new messages
  useEffect(() => {
    if (allMessages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [allMessages.length]);

  // Auto scroll to bottom during streaming
  useEffect(() => {
    if (isStreaming && streamingMessage) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isStreaming, streamingMessage]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!isLoading && allMessages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [isLoading, allMessages.length]);

  const handleLoadEarlier = () => {
    if (hasNextPage && !isFetchingNextPage) {
      const currentScrollHeight = messagesContainerRef.current?.scrollHeight || 0;
      
      fetchNextPage().then(() => {
        // Maintain scroll position after loading earlier messages
        setTimeout(() => {
          if (messagesContainerRef.current) {
            const newScrollHeight = messagesContainerRef.current.scrollHeight;
            const scrollDiff = newScrollHeight - currentScrollHeight;
            messagesContainerRef.current.scrollTop = scrollDiff;
          }
        }, 100);
      });
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-400">Failed to load messages</div>
      </div>
    );
  }

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

  if (isLoading) {
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
      {hasNextPage && (
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

      {/* Streaming Message Display - Appears in correct position */}
      {isStreaming && streamingMessage && (
        <div className="animate-fade-in mb-6">
          <div className="flex gap-3">
            <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarImage src={character.avatar} alt={character.name} />
              <AvatarFallback>{character.fallback}</AvatarFallback>
            </Avatar>
            
            <div className="flex flex-col gap-1 max-w-[80%] items-start">
              <div className="px-4 py-2 text-sm bg-muted text-muted-foreground rounded-lg">
                <FormattedMessage 
                  content={streamingMessage}
                  className="whitespace-pre-wrap"
                />
                <span className="inline-block w-2 h-5 bg-primary animate-pulse ml-1"></span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ChatMessages;