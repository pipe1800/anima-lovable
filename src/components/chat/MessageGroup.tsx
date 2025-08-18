import React, { memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatMessageTime } from "@/utils/messageGrouping";
import { ContextDisplay } from "./ContextDisplay";
import { FormattedMessage } from "@/components/ui/FormattedMessage";
import OptimizedMessageFormatter from "./OptimizedMessageFormatter";
import type { TrackedContext, Message, Character } from '@/types/chat';
import { useAuth } from '@/contexts/AuthContext';
import { Pencil, RotateCcw, /* ChevronLeft, ChevronRight,*/ Check, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

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
  // New: live regenerating content for a specific AI message id
  regeneratingContentByMessageId?: Record<string, string>;
  // New: only allow edit/regenerate on the very latest AI group
  canModify?: boolean;
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
export const MessageGroup = memo(function MessageGroup({ group, character, trackedContext, addonSettings, fontSizeClass, styleOptions, userAvatarUrlOverride, regeneratingContentByMessageId = {}, canModify = false }: MessageGroupProps) {
  const { messages, isUser, showTimestamp } = group;

  // Truncated character display name (first 15 chars)
  const rawCharacterName: string = character?.name || '';
  const truncatedCharacterName = rawCharacterName.length > 15 ? rawCharacterName.slice(0, 15) + '…' : rawCharacterName;

  const sizeClass = fontSizeClass || 'text-base';
  // Dynamic font size mapping for character name (always +4px over message font size)
  const tailwindFontPx: Record<string, number> = {
    'text-xs': 12,
    'text-sm': 14,
    'text-base': 16,
    'text-lg': 18,
    'text-xl': 20,
    'text-2xl': 24,
    'text-3xl': 30,
    'text-4xl': 36,
  };
  const messageFontSizePx = tailwindFontPx[sizeClass.split(' ').find(c => c.startsWith('text-')) || 'text-base'] || 16;
  const nameFontSizePx = messageFontSizePx + 4;

  // Access user profile for avatar
  const { profile } = useAuth();
  const { toast } = useToast();
  // Persona > profile > default precedence
  const resolvedUserAvatarUrl = userAvatarUrlOverride || profile?.avatar_url || DEFAULT_AVATAR;

  // Get avatar style settings
  const avatarStyle = styleOptions?.avatarStyle || 'classic';
  
  // Compute avatar styles - doubled size for classic style
  const avatarSizeClass = 'w-16 h-16'; // Doubled from w-8 h-8
  // Mobile reduction (20%) via responsive classes
  const mobileAvatarSizeClass = 'w-[3.3rem] h-[3.3rem] sm:w-16 sm:h-16';
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

  // Inline edit state for AI messages
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [editValue, setEditValue] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [editingHeight, setEditingHeight] = React.useState<number | null>(null);
  const [editingWidth, setEditingWidth] = React.useState<number | null>(null);

  const startEdit = () => {
    if (isUser) return;
    if (!canModify) return; // Only allow editing on latest AI message/group
    const index = Math.max(messages.length - 1, 0);
    const current = messages[index];
    if (!current || current.id === 'streaming-temp') return;
    // Broadcast begin-edit to ensure only one message is edited at a time globally
    window.dispatchEvent(new CustomEvent('chat-ai-begin-edit', { detail: { groupId: group.id, messageId: current.id } }));
    // Measure current bubble dimensions before switching to textarea
    const el = messageRefs.current[index];
    if (el) {
      const rect = el.getBoundingClientRect();
      setEditingHeight(rect.height);
      setEditingWidth(rect.width);
      // Ensure the bubble is in view
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    setEditingIndex(index);
    setEditValue(current.content || '');
  };

  const cancelEdit = React.useCallback(() => {
    setEditingIndex(null);
    setEditValue('');
    setEditingHeight(null);
    setEditingWidth(null);
  }, []);

  const saveEdit = async () => {
    if (editingIndex === null) return;
    const target = messages[editingIndex];
    if (!target) return;
    try {
      setIsSaving(true);
      const { error } = await supabase
        .from('messages')
        .update({ content: editValue })
        .eq('id', target.id);
      if (error) throw error;
      toast({ title: 'Updated', description: 'Message edited successfully.' });
      cancelEdit();
      // Realtime should update the UI; if not, the next refresh will
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save edit', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const onKeyDownEditor: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  // Close edit when clicking outside the currently edited bubble or its controls
  React.useEffect(() => {
    if (editingIndex === null) return;
    const handlePointerDown = (e: PointerEvent) => {
      const container = messageRefs.current[editingIndex!];
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Ignore clicks on Save/Cancel controls
      if (target.closest('[data-edit-control="true"]')) return;
      if (container && !container.contains(target)) {
        cancelEdit();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [editingIndex, cancelEdit]);

  // Listen for begin-edit events from other groups to enforce single-edit globally
  React.useEffect(() => {
    const onBeginEdit = (e: any) => {
      const sourceGroupId = e?.detail?.groupId as string | undefined;
      if (!sourceGroupId) return;
      if (sourceGroupId !== group.id && editingIndex !== null) {
        cancelEdit();
      }
    };
    window.addEventListener('chat-ai-begin-edit' as any, onBeginEdit as any);
    return () => window.removeEventListener('chat-ai-begin-edit' as any, onBeginEdit as any);
  }, [group.id, editingIndex, cancelEdit]);

  // Action handlers: regenerate (restricted to last message only)
  const handleRegenerate = () => {
    if (isUser || editingIndex !== null) return;
    if (!canModify) return; // Only allow regenerate on latest AI message/group
    const current = messages[Math.max(messages.length - 1, 0)];
    if (!current) return;
    const ev = new CustomEvent('chat-ai-regenerate', { detail: { messageId: current.id } });
    window.dispatchEvent(ev);
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
      {/* Top avatars for mobile (classic style) */}
      {avatarStyle === 'classic' && !isUser && showLeftAvatar && (
        <div className="sm:hidden mb-2 flex justify-start">
          <Avatar className={`${mobileAvatarSizeClass} ${avatarShapeClass}`}>
            <AvatarImage src={character.avatar} alt={character.name} className="object-cover" />
            <AvatarFallback>{character.name?.[0] || 'A'}</AvatarFallback>
          </Avatar>
        </div>
      )}
      {avatarStyle === 'classic' && isUser && showRightAvatar && (
        <div className="sm:hidden mb-2 flex justify-end">
          <Avatar className={`${mobileAvatarSizeClass} ${avatarShapeClass}`}>
            <AvatarImage src={resolvedUserAvatarUrl} alt={profile?.username || 'User'} className="object-cover" />
            <AvatarFallback>{(profile?.username || 'U')[0]}</AvatarFallback>
          </Avatar>
        </div>
      )}
      <div className={`flex gap-3 ${avatarStyle === 'classic' ? 'sm:flex-row flex-col' : ''}`}>
        {/* Left avatar for AI messages (classic style only, hidden on mobile) */}
        {(!isUser && showLeftAvatar && avatarStyle === 'classic') && (
          <Avatar className={`hidden sm:flex ${mobileAvatarSizeClass} flex-shrink-0 ${avatarShapeClass}`}>
            <AvatarImage src={character.avatar} alt={character.name} className="object-cover" />
            <AvatarFallback>{character.name?.[0] || 'A'}</AvatarFallback>
          </Avatar>
        )}
        <div className={`flex flex-col gap-1 max-w-[80%] sm:max-w-[80%] ${isUser ? 'items-end ml-auto' : 'items-start'} w-full`} style={{ maxWidth: '90%' }}>
          {messages.map((message, index) => {
            const baseKey = message.id || `${group.id}-msg-${index}`;
            const dynamicKey = message.id === 'streaming-temp' ? `${baseKey}-${message.content?.length || 0}` : baseKey;
            // Bubble background style (avatar inside bubble). AI: float-left (wrap then full width). User: flex so text never goes under avatar.
            if (avatarStyle === 'bubble-bg') {
              const hasAvatar = isUser ? !!resolvedUserAvatarUrl : !!character.avatar;
              if (hasAvatar) {
                const bgColor = isUser
                  ? toRgba(styleOptions?.userBubbleColor, styleOptions?.userBubbleOpacity, '#FF7A00', 1)
                  : toRgba(styleOptions?.aiBubbleColor, styleOptions?.aiBubbleOpacity, '#1f2937', 0.9);
                const imageUrl = isUser ? (resolvedUserAvatarUrl as string) : (character.avatar as string);
                if (isUser) {
                  return (
                    <div
                      key={dynamicKey}
                      ref={(el) => { messageRefs.current[index] = el; }}
                      className={`relative ${sizeClass} flex items-start justify-end ${index === activeIndex && !isUser ? 'ring-1 ring-white/20' : ''} ${
                        index === 0 && index === messages.length - 1
                          ? 'rounded-lg'
                          : index === 0
                            ? 'rounded-t-lg rounded-bl-lg rounded-br-sm'
                            : index === messages.length - 1
                              ? 'rounded-b-lg rounded-bl-lg rounded-br-sm'
                              : 'rounded-bl-lg rounded-br-sm'
                      }`}
                      style={{ backgroundColor: bgColor }}
                    >
                      <div className="flex-1 min-w-0 px-4 py-3">
                        <span style={textColor ? { color: textColor } : undefined}>
                          <FormattedMessage
                            content={message.content}
                            className={`whitespace-pre-wrap select-text message-content ${regeneratingContentByMessageId?.[(message as any).id] ? 'animate-pulse' : ''}`}
                          />
                        </span>
                      </div>
                      <div
                        className="w-[5.6rem] h-[7rem] md:w-32 md:h-40 bg-center bg-cover ml-5 md:ml-7 shrink-0 rounded-tr-lg rounded-br-lg overflow-hidden"
                        style={{
                          backgroundImage: `url(${imageUrl})`,
                          maskImage: 'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 62%, rgba(0,0,0,0) 100%)',
                          WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 62%, rgba(0,0,0,0) 100%)',
                        }}
                      />
                    </div>
                  );
                }
                const avatarMask = 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 62%, rgba(0,0,0,0) 100%)';
                return (
                  <div
                    ref={(el) => { messageRefs.current[index] = el; }}
                    key={dynamicKey}
                    className={`relative ${sizeClass} ${index === activeIndex && !isUser ? 'ring-1 ring-white/20' : ''} ${
                      index === 0 && index === messages.length - 1
                        ? 'rounded-lg'
                        : index === 0
                          ? 'rounded-t-lg rounded-br-lg rounded-bl-sm'
                          : index === messages.length - 1
                            ? 'rounded-b-lg rounded-br-lg rounded-bl-sm'
                            : 'rounded-br-lg rounded-bl-sm'
                    }`}
                    style={{
                      backgroundColor: bgColor,
                      height: (!isUser && editingIndex === index && editingHeight) ? `${editingHeight}px` : undefined,
                      width: (!isUser && editingIndex === index && editingWidth) ? `${editingWidth}px` : undefined,
                    }}
                  >
                    <div
                      className="float-left w-[5.6rem] h-[7rem] md:w-32 md:h-40 bg-center bg-cover mr-5 md:mr-7"
                      style={{
                        backgroundImage: `url(${imageUrl})`,
                        maskImage: avatarMask as any,
                        WebkitMaskImage: avatarMask as any,
                      }}
                    />
                    <div className="pt-2 pb-3 pr-4 pl-2 md:pl-4 min-h-[7rem]">
                      <div className="font-bold text-white/85 leading-tight mb-2" style={{ fontSize: `${nameFontSizePx}px` }} title={rawCharacterName}>
                        {truncatedCharacterName}
                      </div>
                      {(editingIndex === index) ? (
                        <textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={onKeyDownEditor}
                          className="w-full min-h-[6rem] bg-transparent outline-none resize-none text-white/90 placeholder-white/50"
                          autoFocus
                        />
                      ) : (
                        <span style={textColor ? { color: textColor } : undefined}>
                          <FormattedMessage
                            content={message.content}
                            className={`whitespace-pre-wrap select-text message-content ${regeneratingContentByMessageId?.[(message as any).id] ? 'animate-pulse' : ''}`}
                          />
                        </span>
                      )}
                    </div>
                    <div className="clear-both" />
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
                style={{
                  backgroundColor: bubbleBg,
                  ...bubbleStyle,
                  height: (!isUser && editingIndex === index && editingHeight) ? `${editingHeight}px` : undefined,
                  width: (!isUser && editingIndex === index && editingWidth) ? `${editingWidth}px` : undefined,
                }}
              >
                {!isUser && (
                  <div className="font-semibold text-white/85 leading-none mb-1" style={{ fontSize: `${nameFontSizePx}px` }} title={rawCharacterName}>
                    {truncatedCharacterName}
                  </div>
                )}
                {(!isUser && editingIndex === index) ? (
                  <textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={onKeyDownEditor}
                    className="w-full h-full bg-transparent outline-none resize-none text-white/90 placeholder-white/50"
                    autoFocus
                  />
                ) : (
                  <span style={textColor ? { color: textColor } : undefined}>
                    <FormattedMessage
                      content={(() => {
                        const override = regeneratingContentByMessageId?.[(message as any).id];
                        if (typeof override === 'string') {
                          return override; // show live regenerated stream
                        }
                        return message.content;
                      })()}
                      className={`whitespace-pre-wrap select-text message-content ${regeneratingContentByMessageId?.[(message as any).id] ? 'animate-pulse' : ''}`}
                    />
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {/* Right-side avatar for user messages (classic style only, hidden on mobile). Removed spacer so bubble can align fully right when avatar disabled */}
        {isUser && avatarStyle === 'classic' && showRightAvatar && (
          <Avatar className={`hidden sm:flex ${mobileAvatarSizeClass} flex-shrink-0 ${avatarShapeClass}`}>
            <AvatarImage src={resolvedUserAvatarUrl} alt={profile?.username || 'User'} className="object-cover" />
            <AvatarFallback>{(profile?.username || 'U')[0]}</AvatarFallback>
          </Avatar>
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
            
            const rightActions = (() => {
              // Only show action bar for latest AI group (canModify)
              if (!canModify && editingIndex === null) return null;
              return (
                <div className="flex items-center gap-1">
                  {editingIndex === null ? (
                    <>
                      <button title="Edit response" onClick={startEdit} className={`${iconButtonClass}`} disabled={latestMessage?.id === 'streaming-temp'}>
                        <Pencil className={`${iconClass}`} />
                      </button>
                      <button title="Regenerate" onClick={handleRegenerate} className={`${iconButtonClass}`} disabled={latestMessage?.id === 'streaming-temp'}>
                        <RotateCcw className={`${iconClass}`} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button data-edit-control="true" title={isSaving ? 'Saving...' : 'Save'} onClick={saveEdit} className={`${iconButtonClass}`} disabled={isSaving}>
                        <Check className={`${iconClass}`} />
                      </button>
                      <button data-edit-control="true" title="Cancel" onClick={cancelEdit} className={`${iconButtonClass}`} disabled={isSaving}>
                        <X className={`${iconClass}`} />
                      </button>
                    </>
                  )}
                </div>
              );
            })();
            
            if (hasContextUpdates || hasCurrentContext || hasEnabledAddons) {
              return (
                <ContextDisplay 
                  context={trackedContext}
                  contextUpdates={latestMessage.contextUpdates} 
                  currentContext={trackedContext || latestMessage.current_context}
                  addonSettings={addonSettings}
                  className="mt-2"
                  rightActions={rightActions || undefined}
                />
              );
            }
            // No context widget requested: still show the action bar aligned subtly (only if allowed)
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