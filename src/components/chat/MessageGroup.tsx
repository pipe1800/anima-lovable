import React, { memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatMessageTime } from "@/utils/messageGrouping";
import { ContextDisplay } from "./ContextDisplay";
import { FormattedMessage } from "@/components/ui/FormattedMessage";
import OptimizedMessageFormatter from "./OptimizedMessageFormatter";
import type { TrackedContext, Message, Character } from '@/types/chat';

interface MessageGroupData {
  id: string;
  messages: Message[];
  isUser: boolean;
  timestamp: Date;
  showTimestamp: boolean;
}

// New: style options to control avatars and colors
interface ChatStyleOptions {
  aiTextColor: string;
  userTextColor: string;
  showCharacterAvatar: boolean;
  showUserAvatar: boolean;
  avatarShape: 'circle' | 'rounded';
  avatarSize: 'sm' | 'md' | 'lg';
  // New bubble styles
  aiBubbleColor?: string;
  aiBubbleOpacity?: number;
  userBubbleColor?: string;
  userBubbleOpacity?: number;
}

interface MessageGroupProps {
  group: MessageGroupData;
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
  // New: control font size of message content
  fontSizeClass?: string;
  // New: per-chat style options
  styleOptions?: ChatStyleOptions;
}

// Helper: hex + opacity -> rgba string
const toRgba = (hex?: string, opacity?: number, fallbackHex: string = '#1f2937', fallbackOpacity: number = 1) => {
  const color = (hex || fallbackHex).replace('#','');
  const r = parseInt(color.substring(0,2), 16) || 0;
  const g = parseInt(color.substring(2,4), 16) || 0;
  const b = parseInt(color.substring(4,6), 16) || 0;
  const a = Math.min(Math.max(opacity ?? fallbackOpacity, 0), 1);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

// ✅ PHASE 3: Memoized component to prevent unnecessary re-renders
export const MessageGroup = memo(function MessageGroup({ group, character, trackedContext, addonSettings, fontSizeClass, styleOptions }: MessageGroupProps) {
  const { messages, isUser, showTimestamp } = group;

  const sizeClass = fontSizeClass || 'text-base';

  // Compute avatar styles
  const avatarSizeClass = styleOptions?.avatarSize === 'sm' ? 'w-6 h-6' : styleOptions?.avatarSize === 'lg' ? 'w-10 h-10' : 'w-8 h-8';
  const avatarShapeClass = styleOptions?.avatarShape === 'rounded' ? 'rounded-lg' : 'rounded-full';

  // Decide avatar visibility
  const showLeftAvatar = !isUser && (styleOptions?.showCharacterAvatar ?? true);
  const showRightAvatar = isUser && (styleOptions?.showUserAvatar ?? false);

  // Text color per side
  const textColor = isUser ? styleOptions?.userTextColor : styleOptions?.aiTextColor;

  // Bubble background per side
  const bubbleBg = isUser
    ? toRgba(styleOptions?.userBubbleColor, styleOptions?.userBubbleOpacity, '#FF7A00', 1)
    : toRgba(styleOptions?.aiBubbleColor, styleOptions?.aiBubbleOpacity, '#1f2937', 0.9);

  return (
    <div className="mb-6">
      {showTimestamp && (
        <div className="text-center text-xs text-muted-foreground mb-4">
          {formatMessageTime(group.timestamp)}
        </div>
      )}
      
      <div className={`flex gap-3`}>
        {/* Left avatar for AI messages */}
        {(!isUser && showLeftAvatar) && (
          <Avatar className={`${avatarSizeClass} flex-shrink-0 ${avatarShapeClass}`}>
            <AvatarImage src={character.avatar} alt={character.name} />
            <AvatarFallback>{character.fallback}</AvatarFallback>
          </Avatar>
        )}
        
        <div className={`flex flex-col gap-1 max-w-[80%] ${isUser ? 'items-end ml-auto' : 'items-start'}`}>
          {messages.map((message, index) => (
            <div
              key={message.id === 'streaming-temp' ? `${message.id}-${message.content.length}` : message.id}
              className={`px-4 py-2 ${sizeClass} ${''} ${
                index === 0 && index === messages.length - 1
                  ? 'rounded-lg'
                  : index === 0
                  ? isUser
                    ? 'rounded-t-lg rounded-bl-lg rounded-br-sm'
                    : 'rounded-t-lg rounded-br-lg rounded-bl-sm'
                  : index === messages.length - 1
                  ? isUser
                    ? 'rounded-b-lg rounded-bl-lg rounded-br-sm'
                    : 'rounded-b-lg rounded-br-lg rounded-bl-sm'
                  : isUser
                  ? 'rounded-bl-lg rounded-br-sm'
                  : 'rounded-br-lg rounded-bl-sm'
              }`}
              style={{ backgroundColor: bubbleBg }}
            >
              <span style={textColor ? { color: textColor } : undefined}>
                <FormattedMessage 
                  content={message.content}
                  className="whitespace-pre-wrap select-text message-content"
                />
              </span>
            </div>
          ))}
        </div>
        
        {/* Right-side avatar or spacer for user messages */}
        {isUser && (
          showRightAvatar ? (
            <Avatar className={`${avatarSizeClass} flex-shrink-0 ${avatarShapeClass}`}>
              <AvatarFallback>U</AvatarFallback>
            </Avatar>
          ) : (
            <div className={`${avatarSizeClass} flex-shrink-0`} />
          )
        )}
      </div>
      
      {/* Show context display for AI messages when addons are enabled - ONCE PER GROUP */}
      {!isUser && (
        <div className="mt-3 ml-11">
          {(() => {
            // Get the most recent message in the group for context
            const latestMessage = messages[messages.length - 1];
            
            const hasContextUpdates = latestMessage.contextUpdates && Object.keys(latestMessage.contextUpdates).length > 0;
            const hasCurrentContext = latestMessage.current_context && Object.keys(latestMessage.current_context).length > 0;
            const hasEnabledAddons = addonSettings && (
              addonSettings.moodTracking || 
              addonSettings.clothingInventory || 
              addonSettings.locationTracking || 
              addonSettings.timeAndWeather || 
              addonSettings.relationshipStatus ||
              addonSettings.characterPosition
            );
            
            if (hasContextUpdates || hasCurrentContext || hasEnabledAddons) {
              return (
                <ContextDisplay 
                  context={trackedContext}
                  contextUpdates={latestMessage.contextUpdates} 
                  currentContext={trackedContext || latestMessage.current_context}
                  addonSettings={addonSettings}
                  className="mt-2"
                />
              );
            }
            return null;
          })()}
        </div>
      )}
    </div>
  );
}); // ✅ PHASE 3: Close memo function properly