import React, { memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatMessageTime } from "@/utils/messageGrouping";
import { ContextDisplay } from "./ContextDisplay";
import { FormattedMessage } from "@/components/ui/FormattedMessage";
import OptimizedMessageFormatter from "./OptimizedMessageFormatter";
import type { TrackedContext, Message, Character } from '@/types/chat';
import { useAuth } from '@/contexts/AuthContext';

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
  // New bubble styles
  aiBubbleColor?: string;
  aiBubbleOpacity?: number;
  userBubbleColor?: string;
  userBubbleOpacity?: number;
  // New avatar styles
  avatarStyle?: 'classic' | 'bubble-bg' | 'portrait' | 'side-banner';
  portraitFrameStyle?: 'clean' | 'polaroid' | 'foil';
  portraitFrameColor?: string;
  bannerWidth?: 'sm' | 'md' | 'lg';
  bannerTintFromAvatar?: boolean;
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
  // New: persona > profile > default precedence for user avatar
  userAvatarUrlOverride?: string;
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

// Default avatar path for missing images
const DEFAULT_AVATAR = '/default_avatar.jpg';

// ✅ PHASE 3: Memoized component to prevent unnecessary re-renders
export const MessageGroup = memo(function MessageGroup({ group, character, trackedContext, addonSettings, fontSizeClass, styleOptions, userAvatarUrlOverride }: MessageGroupProps) {
  const { messages, isUser, showTimestamp } = group;

  const sizeClass = fontSizeClass || 'text-base';

  // Access user profile for avatar
  const { profile } = useAuth();
  // Persona > profile > default precedence
  const resolvedUserAvatarUrl = userAvatarUrlOverride || profile?.avatar_url || DEFAULT_AVATAR;

  // Get avatar style settings
  const avatarStyle = styleOptions?.avatarStyle || 'classic';
  
  // Compute avatar styles - doubled size for classic style
  const avatarSizeClass = 'w-16 h-16'; // Doubled from w-8 h-8
  const avatarShapeClass = 'rounded-full'; // Fixed to circular

  // Decide avatar visibility based on style
  let showLeftAvatar = false;
  let showRightAvatar = false;
  
  if (avatarStyle === 'classic') {
    showLeftAvatar = !isUser && (styleOptions?.showCharacterAvatar ?? true);
    showRightAvatar = isUser && (styleOptions?.showUserAvatar ?? false);
  } else if (avatarStyle === 'bubble-bg') {
    // Avatar becomes bubble background, no separate avatar for classic display
    showLeftAvatar = false;
    showRightAvatar = false;
  }

  // Text color per side
  const textColor = isUser ? styleOptions?.userTextColor : styleOptions?.aiTextColor;

  // Bubble background per side - modified for avatar-as-bubble-bg style
  let bubbleBg: string;
  let bubbleStyle: React.CSSProperties = {};
  
  if (avatarStyle === 'bubble-bg' && ((isUser && resolvedUserAvatarUrl) || (!isUser && character.avatar))) {
    // For bubble-bg style, we'll use color background and handle the avatar section separately
    bubbleBg = 'transparent';
  } else {
    bubbleBg = isUser
      ? toRgba(styleOptions?.userBubbleColor, styleOptions?.userBubbleOpacity, '#FF7A00', 1)
      : toRgba(styleOptions?.aiBubbleColor, styleOptions?.aiBubbleOpacity, '#1f2937', 0.9);
  }

  return (
    <div className="mb-6">
      {showTimestamp && (
        <div className="text-center text-xs text-muted-foreground mb-4">
          {formatMessageTime(group.timestamp)}
        </div>
      )}
      
      <div className={`flex gap-3`}>
        {/* Left avatar for AI messages (classic style only) */}
        {(!isUser && showLeftAvatar && avatarStyle === 'classic') && (
          <Avatar className={`${avatarSizeClass} flex-shrink-0 ${avatarShapeClass}`}>
            <AvatarImage src={character.avatar} alt={character.name} className="object-cover" />
            <AvatarFallback>{character.fallback}</AvatarFallback>
          </Avatar>
        )}
        
        <div className={`flex flex-col gap-1 max-w-[80%] ${isUser ? 'items-end ml-auto' : 'items-start'}`}>
          {messages.map((message, index) => {
            // Special handling for bubble-bg style
            if (avatarStyle === 'bubble-bg') {
              const hasAvatar = isUser ? !!resolvedUserAvatarUrl : !!character.avatar;
              if (hasAvatar) {
                const bgColor = isUser
                  ? toRgba(styleOptions?.userBubbleColor, styleOptions?.userBubbleOpacity, '#FF7A00', 1)
                  : toRgba(styleOptions?.aiBubbleColor, styleOptions?.aiBubbleOpacity, '#1f2937', 0.9);
                const imageUrl = isUser ? (resolvedUserAvatarUrl as string) : (character.avatar as string);

                // Build avatar slice and text section, flip order and mask for user side
                const avatarMask = isUser
                  ? 'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)'
                  : 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)';

                const AvatarSlice = (
                  <div 
                    className="relative flex-shrink-0"
                    style={{
                      width: '6.4rem', // 20% smaller than 8rem (w-32)
                      height: '8rem',  // 20% smaller than 10rem (h-40)
                      backgroundImage: `url(${imageUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                      maskImage: avatarMask as any,
                      WebkitMaskImage: avatarMask as any,
                    }}
                  />
                );

                const TextSection = (
                  <div className="flex-1 px-4 py-2 flex flex-col items-start">
                    {!isUser && (
                      <div className="text-[16px] font-bold text-white/85 leading-none mb-1">
                        {character.name}
                      </div>
                    )}
                    <span style={textColor ? { color: textColor } : undefined}>
                      <FormattedMessage 
                        content={message.content}
                        className="whitespace-pre-wrap select-text message-content"
                      />
                    </span>
                  </div>
                );

                return (
                  <div
                    key={message.id === 'streaming-temp' ? `${message.id}-${message.content.length}` : message.id}
                    className={`relative flex overflow-hidden ${sizeClass} ${
                      index === 0 && index === messages.length - 1
                        ? 'rounded-lg'
                        : index === 0
                        ? 'rounded-t-lg rounded-br-lg rounded-bl-sm'
                        : index === messages.length - 1
                        ? 'rounded-b-lg rounded-br-lg rounded-bl-sm'
                        : 'rounded-br-lg rounded-bl-sm'
                    }`}
                    style={{ backgroundColor: bgColor }}
                  >
                    {isUser ? (<>{TextSection}{AvatarSlice}</>) : (<>{AvatarSlice}{TextSection}</>)}
                  </div>
                );
              }
            }
            
            // Default rendering for other styles
            return (
              <div
                key={message.id === 'streaming-temp' ? `${message.id}-${message.content.length}` : message.id}
                className={`relative px-4 py-2 ${sizeClass} ${
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
                style={{ backgroundColor: bubbleBg, ...bubbleStyle }}
              >
                {!isUser && (
                  <div className="text-[11px] font-semibold text-white/85 leading-none mb-1">
                    {character.name}
                  </div>
                )}
                <span style={textColor ? { color: textColor } : undefined}>
                  <FormattedMessage 
                    content={message.content}
                    className="whitespace-pre-wrap select-text message-content"
                  />
                </span>
              </div>
            );
          })}
        </div>
        
        {/* Right-side avatar or spacer for user messages (classic style only) */}
        {isUser && avatarStyle === 'classic' && (
          (showRightAvatar ? (
            <Avatar className={`${avatarSizeClass} flex-shrink-0 ${avatarShapeClass}`}>
              <AvatarImage src={resolvedUserAvatarUrl} alt="User" className="object-cover" />
              <AvatarFallback>U</AvatarFallback>
            </Avatar>
          ) : (
            <div className={`${avatarSizeClass} flex-shrink-0`} />
          ))
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