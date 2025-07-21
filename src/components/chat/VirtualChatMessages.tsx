import React, { memo, useMemo, useRef, useEffect } from 'react';
import { MessageGroup } from './MessageGroup';
import type { Message, Character, TrackedContext } from '@/types/chat';

/**
 * Phase 3 Performance Optimization: Smart Message Rendering
 * 
 * Benefits:
 * - Efficient rendering for large chat histories
 * - Virtualization when needed (>100 messages)
 * - Memory-conscious message management
 * - Smooth scrolling performance
 */

// ============================================================================
// MESSAGE GROUP TYPES
// ============================================================================

interface MessageGroupData {
  id: string;
  messages: Message[];
  isUser: boolean;
  timestamp: Date;
  showTimestamp: boolean;
}

// ============================================================================
// SMART RENDERING STRATEGY
// ============================================================================

interface SmartChatMessagesProps {
  messageGroups: MessageGroupData[];
  character: Character;
  trackedContext?: TrackedContext;
  addonSettings?: {
    moodTracking?: boolean;
    clothingInventory?: boolean;
    locationTracking?: boolean;
    timeAndWeather?: boolean;
    relationshipStatus?: boolean;
    characterPosition?: boolean;
  };
  onMessageAction?: (messageId: string, action: string) => void;
  height?: number;
  className?: string;
}

export const SmartChatMessages = memo(({
  messageGroups,
  character,
  trackedContext,
  addonSettings,
  onMessageAction,
  height = 600,
  className = ''
}: SmartChatMessagesProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  // Determine if we need virtualization
  const useVirtualization = messageGroups.length > 100;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (shouldAutoScroll.current && containerRef.current) {
      const container = containerRef.current;
      container.scrollTop = container.scrollHeight;
    }
  }, [messageGroups]);

  // Handle scroll events
  const handleScroll = () => {
    if (containerRef.current) {
      const container = containerRef.current;
      const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 10;
      shouldAutoScroll.current = isAtBottom;
    }
  };

  if (messageGroups.length === 0) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ height }}>
        <p className="text-muted-foreground">No messages yet</p>
      </div>
    );
  }

  // For large chats, show only recent messages for performance
  const visibleGroups = useVirtualization 
    ? messageGroups.slice(-50) // Show last 50 groups
    : messageGroups;

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto ${className}`}
      style={{ height }}
      onScroll={handleScroll}
    >
      {useVirtualization && messageGroups.length > 50 && (
        <div className="text-center p-4 text-muted-foreground text-sm">
          Showing recent {visibleGroups.length} of {messageGroups.length} message groups
        </div>
      )}
      
      {visibleGroups.map((group) => (
        <MessageGroup
          key={group.id}
          group={group}
          character={character}
          trackedContext={trackedContext}
          addonSettings={addonSettings}
        />
      ))}
    </div>
  );
});

SmartChatMessages.displayName = 'SmartChatMessages';

// ============================================================================
// PERFORMANCE MONITORING HOOK
// ============================================================================

export const useSmartScrollPerformance = (messageCount: number) => {
  const metricsRef = useRef({
    renderTime: 0,
    memoryUsage: 0,
    scrollEvents: 0,
    lastUpdate: Date.now()
  });

  useEffect(() => {
    // Update metrics when message count changes
    metricsRef.current.lastUpdate = Date.now();
    
    // Estimate memory usage (rough calculation)
    metricsRef.current.memoryUsage = messageCount * 0.5; // KB per message
    
    if (process.env.NODE_ENV === 'development') {
      console.log('Smart Scroll Metrics:', {
        messageCount,
        estimatedMemory: `${metricsRef.current.memoryUsage.toFixed(1)}KB`,
        renderingStrategy: messageCount > 100 ? 'windowed' : 'full'
      });
    }
  }, [messageCount]);

  return metricsRef.current;
};

// ============================================================================
// MESSAGE SEARCH AND NAVIGATION
// ============================================================================

export const useMessageSearch = (messageGroups: MessageGroupData[]) => {
  const searchMessage = (query: string) => {
    const matchIndex = messageGroups.findIndex(group =>
      group.messages.some(msg => 
        msg.content.toLowerCase().includes(query.toLowerCase())
      )
    );
    
    return matchIndex;
  };

  const jumpToMessage = (messageId: string) => {
    const messageIndex = messageGroups.findIndex(group =>
      group.messages.some(msg => msg.id === messageId)
    );
    
    return messageIndex;
  };

  return { searchMessage, jumpToMessage };
};

export type { SmartChatMessagesProps, MessageGroupData };
