import React, { memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatMessageTime } from "@/utils/messageGrouping";
import { ContextDisplay } from "./ContextDisplay";
import { FormattedMessage } from "@/components/ui/FormattedMessage";
import OptimizedMessageFormatter from "./OptimizedMessageFormatter";
import type { TrackedContext, Message, Character } from '@/types/chat';
import { useAuth } from '@/contexts/AuthContext';
import { Pencil, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';

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

  // Navigation: keep all messages visible but track a highlighted one (AI only)
  const [activeIndex, setActiveIndex] = React.useState(Math.max(messages.length - 1, 0));
  const messageRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  React.useEffect(() => {
    setActiveIndex(Math.max(messages.length - 1, 0));
    // Ensure newest is visible
    const el = messageRefs.current[Math.max(messages.length - 1, 0)];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, group.id]);

  // Action handlers: dispatch CustomEvents upward, parent can listen on window/document
  const handleEdit = () => {
    const current = messages[Math.min(Math.max(activeIndex, 0), Math.max(messages.length - 1, 0))];
    if (!current || isUser) return;
    const ev = new CustomEvent('chat-ai-edit', { detail: { messageId: current.id } });
    window.dispatchEvent(ev);
  };
  const handleRegenerate = () => {
    const current = messages[Math.min(Math.max(activeIndex, 0), Math.max(messages.length - 1, 0))];
    if (!current || isUser) return;
    const ev = new CustomEvent('chat-ai-regenerate', { detail: { messageId: current.id } });
    window.dispatchEvent(ev);
  };
  const handleNextVariant = () => {
    if (isUser) return;
    if (activeIndex < messages.length - 1) {
      const next = activeIndex + 1;
      setActiveIndex(next);
      const el = messageRefs.current[next];
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    } else {
      // At the end: request a new variant (keep previous)
      const current = messages[Math.min(Math.max(activeIndex, 0), Math.max(messages.length - 1, 0))];
      const ev = new CustomEvent('chat-ai-variant-next', { detail: { messageId: current?.id } });
      window.dispatchEvent(ev);
    }
  };
  const handlePrevVariant = () => {
    if (isUser) return;
    if (activeIndex > 0) {
      const prev = activeIndex - 1;
      setActiveIndex(prev);
      const el = messageRefs.current[prev];
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  };

  // Subtle icon styles
  const iconClass = "w-4 h-4 text-white/60 hover:text-white transition-colors";
  const iconButtonClass = "p-1 rounded hover:bg-white/5 active:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed";

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
                    ref={(el) => { messageRefs.current[index] = el; }}
                    key={message.id === 'streaming-temp' ? `${message.id}-${message.content.length}` : message.id}
                    className={`relative flex overflow-hidden ${sizeClass} ${index === activeIndex && !isUser ? 'ring-1 ring-white/20' : ''} ${
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
                ref={(el) => { messageRefs.current[index] = el; }}
                key={message.id === 'streaming-temp' ? `${message.id}-${message.content.length}` : message.id}
                className={`relative px-4 py-2 ${sizeClass} ${index === activeIndex && !isUser ? 'ring-1 ring-white/20' : ''} ${
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
      
      {/* Show context display for AI messages with action icons */}
      {!isUser && (
        <div className="mt-3 ml-11">
          {(() => {
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
            
            const rightActions = (
              <div className="flex items-center gap-1">
                <button title="Edit response" onClick={handleEdit} className={`${iconButtonClass}`}>
                  <Pencil className={`${iconClass}`} />
                </button>
                <button title="Regenerate" onClick={handleRegenerate} className={`${iconButtonClass}`}>
                  <RotateCcw className={`${iconClass}`} />
                </button>
                <div className="flex items-center ml-1">
                  <button title="Previous" onClick={handlePrevVariant} className={`${iconButtonClass}`} disabled={activeIndex <= 0}>
                    <ChevronLeft className={`${iconClass}`} />
                  </button>
                  <button title="Next" onClick={handleNextVariant} className={`${iconButtonClass}`}>
                    <ChevronRight className={`${iconClass}`} />
                  </button>
                </div>
              </div>
            );
            
            if (hasContextUpdates || hasCurrentContext || hasEnabledAddons) {
              return (
                <ContextDisplay 
                  context={trackedContext}
                  contextUpdates={latestMessage.contextUpdates} 
                  currentContext={trackedContext || latestMessage.current_context}
                  addonSettings={addonSettings}
                  className="mt-2"
                  rightActions={rightActions}
                />
              );
            }
            // No context widget requested: still show the action bar aligned subtly
            return (
              <div className="flex justify-end">
                {rightActions}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}); // ✅ PHASE 3: Close memo function properly