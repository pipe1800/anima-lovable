import React, { useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { Message, TrackedContext } from '@/types/chat';
import type { UserGlobalChatSettings } from '@/types/chatSettings';
import { MessageGroup } from './MessageGroup';
import { groupMessages } from '@/utils/messageGrouping';
import { useUserGlobalChatSettings } from '@/data/chats/settings';
import { logger } from '@/utils/logger';
import { useTypewriterStream } from '../../hooks/useTypewriterStream';

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
  // Optimization: allow parent to provide global settings to avoid duplicate queries
  globalSettingsOverride?: UserGlobalChatSettings | null;
}

type AugmentedMessage = Message & {
  is_ai_message?: boolean;
  isTemporaryStreaming?: boolean;
};

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
  globalSettingsOverride,
}: ChatMessagesProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // Track when we're prepending earlier messages so we can skip bottom autoscroll for that cycle
  const loadingEarlierRef = useRef(false);
  // Track last chat id to detect chat switches
  const lastChatIdRef = useRef<string | null>(null);
  // Track whether we've performed the initial jump-to-bottom for the current chat
  const initialScrollDoneRef = useRef(false);
  const initialScrollPendingRef = useRef(false);
  
  // Load addon and style settings from global settings
  // Use override if provided (prevents extra React Query fetch)
  // Avoid duplicate fetch if parent already provided settings
  const { data: globalSettings } = useUserGlobalChatSettings({ enabled: !globalSettingsOverride });
  const effectiveGlobalSettings = globalSettingsOverride || globalSettings || null;

  // Map global style settings
  const backgroundImage = effectiveGlobalSettings?.background_image_url || null;
  const styleOptions = useMemo(() => ({
    aiTextColor: effectiveGlobalSettings?.ai_text_color ?? '#E5E7EB',
    userTextColor: effectiveGlobalSettings?.user_text_color ?? '#FFFFFF',
    showCharacterAvatar: effectiveGlobalSettings?.show_character_avatar ?? true,
    showUserAvatar: effectiveGlobalSettings?.show_user_avatar ?? false,
    // Bubble styles
    aiBubbleColor: effectiveGlobalSettings?.ai_bubble_color ?? '#1f2937',
    aiBubbleOpacity: effectiveGlobalSettings?.ai_bubble_opacity ?? 0.9,
    userBubbleColor: effectiveGlobalSettings?.user_bubble_color ?? '#FF7A00',
    userBubbleOpacity: effectiveGlobalSettings?.user_bubble_opacity ?? 1,
    // Advanced avatar styles
    avatarStyle: (effectiveGlobalSettings?.avatar_style ?? 'classic') as 'classic' | 'bubble-bg' | 'portrait' | 'side-banner',
    portraitFrameStyle: (effectiveGlobalSettings?.portrait_frame_style ?? 'clean') as 'clean' | 'polaroid' | 'foil',
    portraitFrameColor: effectiveGlobalSettings?.portrait_frame_color ?? '#4B5563',
    bannerWidth: (effectiveGlobalSettings?.banner_width ?? 'md') as 'sm' | 'md' | 'lg',
    bannerTintFromAvatar: effectiveGlobalSettings?.banner_tint_from_avatar ?? false,
  }), [effectiveGlobalSettings]);
  
  // Compute font size class from global settings
  const fontSizeClass = useMemo(() => {
    const size = effectiveGlobalSettings?.font_size;
    switch (size) {
      case 'small':
        return 'text-sm';
      case 'large':
        return 'text-lg';
      default:
        return 'text-base';
    }
  }, [effectiveGlobalSettings?.font_size]);

  // New: compute addon settings once to reuse across groups and streaming bubble
  const computedAddonSettings = useMemo(() => {
    if (effectiveGlobalSettings) {
      return {
        moodTracking: effectiveGlobalSettings.mood_tracking,
        clothingInventory: effectiveGlobalSettings.clothing_inventory,
        locationTracking: effectiveGlobalSettings.location_tracking,
        timeAndWeather: effectiveGlobalSettings.time_and_weather,
        relationshipStatus: effectiveGlobalSettings.relationship_status,
        characterPosition: effectiveGlobalSettings.character_position,
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
  }, [effectiveGlobalSettings]);

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

  // Compute the last AI message from the current messages list (must be before effects using it)
  const lastAiMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message && !message.isUser) {
        return message;
      }
    }
    return null;
  }, [messages]);

  // New simplified approach: typewriter animation on complete message based on user preference
  const streamingMode = effectiveGlobalSettings?.streaming_mode || 'smooth';
  const shouldAnimate = streamingMode === 'smooth';
  
  const { text: typewriterText, feedChunk, markStreamFinished, isTyping, clear } = useTypewriterStream({ 
    charsPerSecond: 75 
  });
  const lastProcessedMessageRef = useRef('');
  
  // When we get a complete streaming message, feed it to typewriter (in smooth mode) or show immediately (in instant mode)
  useEffect(() => {
    if (streamingMessage && streamingMessage !== lastProcessedMessageRef.current) {
      lastProcessedMessageRef.current = streamingMessage;
      
      if (shouldAnimate && isStreaming) {
        // Clear typewriter and feed complete message for animation
        clear();
        feedChunk(streamingMessage);
        markStreamFinished();
      }
    }
  }, [streamingMessage, shouldAnimate, isStreaming, clear, feedChunk, markStreamFinished]);
  const isTypewriterComplete = !isTyping && !!lastProcessedMessageRef.current && !isStreaming;

  // Simple filtering - hide real messages that match the message being animated
  const filteredMessages = useMemo<AugmentedMessage[]>(() => {
    return messages.filter((message) => {
      if (!message) return false;
      if (!message.content || !String(message.content).trim()) return false;
      
      // Hide real message if we're currently animating the same content
      if (shouldAnimate && isTyping && lastProcessedMessageRef.current && 
          message.content === lastProcessedMessageRef.current && !(message as AugmentedMessage).isTemporaryStreaming) {
        return false;
      }
      
      return true;
    }) as AugmentedMessage[];
  }, [messages, shouldAnimate, isTyping]);

  // Temporary streaming message while typewriter animates (only in smooth mode)
  const tempStreamingMessage = useMemo(() => {
    // Don't create temp streaming message in instant mode
    if (!shouldAnimate) return null;
    if (!typewriterText) return null;
    if (isTypewriterComplete) return null;
    // Use a very high message_order to ensure it appears last
    const maxOrder = Math.max(...filteredMessages.map((message) => message.message_order ?? 0), 0);
    const tempMessage: AugmentedMessage = {
      id: `streaming-${chatId}`,
      content: typewriterText,
      isUser: false,
      is_ai_message: true,
      isTemporaryStreaming: true,
      timestamp: new Date(),
      message_order: maxOrder + 1000, // Large gap to ensure it's always last
    };
    return tempMessage;
  }, [filteredMessages, chatId, typewriterText, isTypewriterComplete, shouldAnimate]);

  // Simple logic: show temp message only if animating in smooth mode
  const streamingAugmentedMessages = useMemo<AugmentedMessage[]>(() => {
    if (shouldAnimate && tempStreamingMessage && isTyping) {
      return [...filteredMessages, tempStreamingMessage];
    }
    return filteredMessages;
  }, [filteredMessages, tempStreamingMessage, shouldAnimate, isTyping]);

  // Group messages (with stabilization for streaming group to reduce avatar flicker)
  const messageGroups = useMemo(() => {
    const groups = groupMessages(streamingAugmentedMessages);
    return groups.map(group => {
      if (group.messages.some((message) => (message as AugmentedMessage).isTemporaryStreaming)) {
        return {
          ...group,
          id: `streaming-group-${chatId}`,
        };
      }
      return group;
    });
  }, [streamingAugmentedMessages, chatId]);

  // RE-ADD lastAiGroupId computation (needed for canModify prop)
  const lastAiGroupId = useMemo<string | null>(() => {
    for (let i = messageGroups.length - 1; i >= 0; i -= 1) {
      const group = messageGroups[i];
      if (group && group.isUser === false) {
        return group.id;
      }
    }
    return null;
  }, [messageGroups]);

  // RE-ADD load earlier handler
  const handleLoadEarlier = useCallback(() => {
    if (hasMore && !isFetchingNextPage && fetchNextPage) {
      const currentScrollHeight = messagesContainerRef.current?.scrollHeight || 0;
      loadingEarlierRef.current = true;
      fetchNextPage();
      setTimeout(() => {
        if (messagesContainerRef.current) {
          const newScrollHeight = messagesContainerRef.current.scrollHeight;
          const scrollDiff = newScrollHeight - currentScrollHeight;
          messagesContainerRef.current.scrollTop = scrollDiff;
        }
        requestAnimationFrame(() => { loadingEarlierRef.current = false; });
      }, 100);
    }
  }, [hasMore, isFetchingNextPage, fetchNextPage]);

  // Decide if the streaming bubble should be shown (separate bubble strategy)
  const showStreamingBubble = useMemo(() => {
    return false; // still disabled (we integrate into list)
  }, []);

  // Remove premature clearing effect that caused flicker (final + temp both hidden)
  // useEffect(() => { ...existing code... }, [isStreaming, displayedStream, messages]);

  // After animation finishes, clear the streamed buffer (after final message is visible) to avoid holding large strings
  useEffect(() => {
    if (!isTypewriterComplete) return;
    if (!typewriterText) return;
    const t = setTimeout(() => { 
      lastProcessedMessageRef.current = '';
      clear(); // Also clear the typewriter state
    }, 250);
    return () => clearTimeout(t);
  }, [isTypewriterComplete, typewriterText, clear]);

  // Robust force scroll utility (desktop + mobile) with double rAF to catch late layout (images, fonts, streamed chars)
  const forceScrollToBottom = useCallback((behavior: ScrollBehavior = 'auto', extraPadding: number = 0) => {
    const el = messagesContainerRef.current;
    if (!el) return;
    // Immediate jump with extra padding for message bubble height
    const targetScroll = el.scrollHeight + extraPadding;
    el.scrollTop = targetScroll;
    // Double frame to account for just-rendered streaming characters / images
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight + extraPadding;
      requestAnimationFrame(() => { 
        el.scrollTop = el.scrollHeight + extraPadding; 
      });
    });
    // Fallback for mobile browsers if outer document scrolls instead
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: document.documentElement.scrollHeight + extraPadding, behavior });
      });
    }
  }, []);

  // Continuous auto-scroll during typewriter animation
  useEffect(() => {
    if (shouldAnimate && isTyping) {
      // Set up a continuous scroll interval while typing is active
      const scrollInterval = setInterval(() => {
        forceScrollToBottom('auto', 300);
      }, 100); // Every 100ms for smooth continuous scrolling
      
      return () => clearInterval(scrollInterval);
    }
  }, [shouldAnimate, isTyping, forceScrollToBottom]);

  // Final scroll when typewriter animation completes
  useEffect(() => {
    if (isTypewriterComplete && typewriterText) {
      // Ensure buttons are fully visible when animation finishes
      setTimeout(() => {
        forceScrollToBottom('auto', 300);
      }, 100);
    }
  }, [isTypewriterComplete, typewriterText, forceScrollToBottom]);

  // On chat switch, mark that we need an initial instantaneous scroll when messages arrive
  useEffect(() => {
    if (!chatId) return;
    if (lastChatIdRef.current !== chatId) {
      lastChatIdRef.current = chatId;
      initialScrollDoneRef.current = false;
      initialScrollPendingRef.current = true;
    }
  }, [chatId]);

  // Layout effect so initial jump happens before paint to avoid visible scroll animation
  useLayoutEffect(() => {
    if (messages.length === 0) return;
    if (initialScrollPendingRef.current && !initialScrollDoneRef.current) {
      // Instant jump (no smooth)
      forceScrollToBottom('auto');
      initialScrollDoneRef.current = true;
      initialScrollPendingRef.current = false;
      return;
    }
  }, [messages.length, forceScrollToBottom]);

  // Non-initial auto-scroll for new messages appended at bottom
  useEffect(() => {
    if (messages.length === 0) return;
    if (loadingEarlierRef.current) return; // user loaded earlier messages; don't yank scroll
    if (!initialScrollDoneRef.current) return; // handled by layout effect
    forceScrollToBottom(messages.length < 5 ? 'auto' : 'smooth');
  }, [messages.length, forceScrollToBottom]);

  // Continuous scroll during streaming (each incremental character rerender)
  const lastStreamLenRef = useRef(0);
  useEffect(() => {
    if (!showStreamingBubble) { lastStreamLenRef.current = 0; return; }
    const currentLen = typewriterText.length;
    if (currentLen !== lastStreamLenRef.current) {
      lastStreamLenRef.current = currentLen;
      forceScrollToBottom('auto');
    }
  }, [typewriterText, showStreamingBubble, forceScrollToBottom]);

  // Fallback: when loading finishes and we have messages but container isn't at bottom (e.g., images loaded after render)
  useEffect(() => {
    if (isLoadingMessages) return;
    if (!messagesContainerRef.current) return;
    const el = messagesContainerRef.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
    if (!nearBottom) {
      // Force alignment once after load
      forceScrollToBottom('auto');
    }
  }, [isLoadingMessages, forceScrollToBottom]);

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
        className="chat-messages-container absolute inset-0 overflow-y-auto p-6 space-y-6 font-['Open_Sans',_sans-serif]"
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
              globalSettingsOverride={effectiveGlobalSettings}
              styleOptions={styleOptions}
            />
          ))
        ) : (
          // Show empty state for chat with no messages yet
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              <p className="text-lg">Your conversation with {character.name.length > 40 ? character.name.slice(0,37) + '…' : character.name} will appear here</p>
              <p className="text-sm mt-2">Send your first message to get started!</p>
            </div>
          </div>
        )}

        {/* Live streaming bubble for smooth mode */}
        {showStreamingBubble && (
          <MessageGroup
            key="streaming-group"
            group={{
              id: 'streaming-group',
              messages: [
                {
                  id: 'streaming-temp',
                  content: typewriterText,
                  isUser: false,
                  timestamp: new Date(),
                },
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
            globalSettingsOverride={effectiveGlobalSettings}
            styleOptions={styleOptions}
          />
        )}

        {/* Messages are already integrated with streaming via the hook */}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ChatMessages;
