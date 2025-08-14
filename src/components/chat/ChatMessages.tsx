import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { Message, TrackedContext } from '@/types/chat';
import { MessageGroup } from './MessageGroup';
import { groupMessages } from '@/utils/messageGrouping';
import { useUserGlobalChatSettings } from '@/queries/chatSettingsQueries';
import { logger } from '@/utils/logger';

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
  // New: allow parent to control background rendering
  renderBackground?: boolean;
  // New: allow parent to override user avatar (persona > profile > default)
  userAvatarUrlOverride?: string;
  // New: show regenerating stream for a deleted AI message in place
  regeneratingContentByMessageId?: Record<string, string>;
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
  debugInfo = [],
  renderBackground = true,
  userAvatarUrlOverride,
  regeneratingContentByMessageId = {},
}: ChatMessagesProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  // Load addon and style settings from global settings
  const { data: globalSettings } = useUserGlobalChatSettings();

  // Map global style settings
  const backgroundImage = globalSettings?.background_image_url || null;
  const styleOptions = useMemo(() => ({
    aiTextColor: globalSettings?.ai_text_color ?? '#E5E7EB',
    userTextColor: globalSettings?.user_text_color ?? '#FFFFFF',
    showCharacterAvatar: globalSettings?.show_character_avatar ?? true,
    showUserAvatar: globalSettings?.show_user_avatar ?? false,
    // Bubble styles
    aiBubbleColor: globalSettings?.ai_bubble_color ?? '#1f2937',
    aiBubbleOpacity: globalSettings?.ai_bubble_opacity ?? 0.9,
    userBubbleColor: globalSettings?.user_bubble_color ?? '#FF7A00',
    userBubbleOpacity: globalSettings?.user_bubble_opacity ?? 1,
    // Advanced avatar styles
    avatarStyle: (globalSettings?.avatar_style ?? 'classic') as 'classic' | 'bubble-bg' | 'portrait' | 'side-banner',
    portraitFrameStyle: (globalSettings?.portrait_frame_style ?? 'clean') as 'clean' | 'polaroid' | 'foil',
    portraitFrameColor: globalSettings?.portrait_frame_color ?? '#4B5563',
    bannerWidth: (globalSettings?.banner_width ?? 'md') as 'sm' | 'md' | 'lg',
    bannerTintFromAvatar: globalSettings?.banner_tint_from_avatar ?? false,
  }), [globalSettings]);
  
  // Compute font size class from global settings
  const fontSizeClass = useMemo(() => {
    const size = globalSettings?.font_size;
    switch (size) {
      case 'small':
        return 'text-sm';
      case 'large':
        return 'text-lg';
      default:
        return 'text-base';
    }
  }, [globalSettings?.font_size]);

  // New: compute addon settings once to reuse across groups and streaming bubble
  const computedAddonSettings = useMemo(() => {
    if (globalSettings) {
      return {
        moodTracking: globalSettings.mood_tracking,
        clothingInventory: globalSettings.clothing_inventory,
        locationTracking: globalSettings.location_tracking,
        timeAndWeather: globalSettings.time_and_weather,
        relationshipStatus: globalSettings.relationship_status,
        characterPosition: globalSettings.character_position,
      };
    }
    // Default to all enabled while loading to ensure context displays
    return {
      moodTracking: true,
      clothingInventory: true,
      locationTracking: true,
      timeAndWeather: true,
      relationshipStatus: true,
      characterPosition: true,
    };
  }, [globalSettings]);

  // Use tracked context as the primary source (real-time from database), fall back to message context
  const contextToUse = React.useMemo(() => {
    // PRIORITY 1: Check tracked context from database (real-time updated)
    if (trackedContext) {
      const hasValidTrackedContext = Object.values(trackedContext).some(
        value => value && value !== 'No context'
      );
      if (hasValidTrackedContext) {
        logger.debug('Using tracked context from database (PRIORITY 1):', trackedContext);
        return trackedContext;
      }
    }
    
    // PRIORITY 2: Fall back to context from messages if database context is empty
    if (messages.length > 0) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (!message.isUser && message.current_context) {
          const messageContext = message.current_context;
          const hasValidMessageContext = Object.values(messageContext).some(
            value => value && value !== 'No context'
          );
          if (hasValidMessageContext) {
            logger.debug('Using context from message (PRIORITY 2):', messageContext);
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

  // Identify the last AI group id to control modify permissions
  const lastAiGroupId = useMemo(() => {
    for (let i = messageGroups.length - 1; i >= 0; i--) {
      const g = messageGroups[i] as any;
      if (g && g.isUser === false) return g.id as string;
    }
    return null as any;
  }, [messageGroups]);

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

  // Typewriter-rendered streaming text for smooth mode
  const [displayedStream, setDisplayedStream] = React.useState('');

  // Compute the last AI message from the current messages list
  const lastAiMessage = useMemo(() => {
    for (let i = (messages?.length || 0) - 1; i >= 0; i--) {
      const m = messages[i] as any;
      if (m && !m.isUser) return m;
    }
    return null as any;
  }, [messages]);

  // Incrementally reveal streamingMessage one character at a time
  useEffect(() => {
    if (!isStreaming) return;
    if (!streamingMessage) return;

    const speedMs = 12; // typing speed per character
    const interval = setInterval(() => {
      setDisplayedStream(prev => {
        if (!isStreaming) return prev; // keep content until final AI message arrives
        if (prev.length >= (streamingMessage?.length || 0)) return prev;
        return streamingMessage.slice(0, prev.length + 1);
      });
    }, speedMs);

    return () => clearInterval(interval);
  }, [isStreaming, streamingMessage]);

  // When streaming stops, keep the streamed text until the final AI message is present
  useEffect(() => {
    if (isStreaming) return;
    if (!displayedStream) return;
    const finalContent = lastAiMessage?.content as string | undefined;
    if (finalContent && finalContent.includes(displayedStream)) {
      // Final AI message includes our streamed content, safe to clear
      setDisplayedStream('');
    }
  }, [isStreaming, displayedStream, lastAiMessage?.content]);

  // Decide if the streaming bubble should be shown to avoid flicker
  const showStreamingBubble = useMemo(() => {
    if (!displayedStream) return false;
    if (isStreaming) return true;
    // After streaming ends, keep bubble until final AI message appears
    const finalContent = lastAiMessage?.content as string | undefined;
    if (!finalContent) return true;
    return !finalContent.includes(displayedStream);
  }, [isStreaming, displayedStream, lastAiMessage?.content]);

  // ✅ PHASE 3: Optimized auto-scroll with better performance
  useEffect(() => {
    const shouldAutoScroll = () => {
      if (isLoadingMessages && messages.length === 0) return false;
      return messages.length > 0 || showStreamingBubble;
    };

    if (shouldAutoScroll()) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ 
          behavior: isLoadingMessages ? 'auto' : 'smooth', 
          block: 'end' 
        });
      });
    }
  }, [messages.length, showStreamingBubble, isLoadingMessages]);

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
    <div className="relative h-full">
      {/* Static background layer (can be disabled by parent) */}
      {renderBackground && backgroundImage && (
        <div
          className="absolute inset-0 bg-center bg-cover"
          style={{ backgroundImage: `url(${backgroundImage})` }}
        />
      )}
      {/* Dark overlay for readability */}
      {renderBackground && backgroundImage && (
        <div className="absolute inset-0 bg-black/50 pointer-events-none" />
      )}

      {/* Scrollable messages layer */}
      <div 
        ref={messagesContainerRef}
        className="absolute inset-0 overflow-y-auto p-6 space-y-6 font-['Open_Sans',_sans-serif]"
      >
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
                  <svg className="w-4 h-4 animate-spin mr-2" viewBox="0 0 24 24"></svg>
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
              addonSettings={computedAddonSettings}
              fontSizeClass={fontSizeClass}
              userAvatarUrlOverride={userAvatarUrlOverride}
              regeneratingContentByMessageId={regeneratingContentByMessageId}
              canModify={!group.isUser && group.id === lastAiGroupId}
              {...({ styleOptions } as any)}
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

        {/* Live streaming bubble for smooth mode without flicker */}
        {showStreamingBubble && (
          <MessageGroup
            key="streaming-group"
            group={{
              id: 'streaming-group',
              messages: [
                {
                  id: 'streaming-temp',
                  content: displayedStream,
                  isUser: false,
                } as any,
              ],
              isUser: false,
              timestamp: new Date(),
              showTimestamp: false,
            }}
            character={character}
            trackedContext={contextToUse}
            addonSettings={computedAddonSettings}
            fontSizeClass={fontSizeClass}
            userAvatarUrlOverride={userAvatarUrlOverride}
            canModify={false}
            {...({ styleOptions } as any)}
          />
        )}

        {/* Messages are already integrated with streaming via the hook */}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ChatMessages;