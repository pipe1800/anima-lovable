import { memo, useState, useEffect, useRef, useCallback } from 'react';
import type { CSSProperties, KeyboardEventHandler } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatMessageTime } from "@/utils/messageGrouping";
import { FormattedMessage } from "@/components/ui/FormattedMessage";
import OptimizedMessageFormatter from "./OptimizedMessageFormatter";
import type { TrackedContext, Message, Character } from '@/types/chat';
import { useAuth } from '@/contexts/AuthContext';
import { Pencil, RotateCcw, /* ChevronLeft, ChevronRight,*/ Check, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateMessageContent } from '@/data/chats/queries';
import type { UserGlobalChatSettings } from '@/types/chatSettings';

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
  // Optimization: pass global settings to nested FormattedMessage to avoid repeated queries
  globalSettingsOverride?: Partial<UserGlobalChatSettings> | null;
}

type ChatAiEditEventDetail = {
  groupId?: string;
  messageId?: string;
};

type ChatAiBeginEditEvent = CustomEvent<ChatAiEditEventDetail>;

const BEGIN_EDIT_EVENT = 'chat-ai-begin-edit';
const REGENERATE_EVENT = 'chat-ai-regenerate';

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
export const MessageGroup = memo(function MessageGroup({ group, character, trackedContext, addonSettings, fontSizeClass, styleOptions, userAvatarUrlOverride, regeneratingContentByMessageId = {}, canModify = false, globalSettingsOverride }: MessageGroupProps) {
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
  const bubbleStyle: CSSProperties = {};
  
  if (avatarStyle === 'bubble-bg' && ((isUser && resolvedUserAvatarUrl) || (!isUser && character.avatar))) {
    // For bubble-bg style, we'll use color background and handle the avatar section separately
    bubbleBg = 'transparent';
  } else {
    bubbleBg = isUser
      ? toRgba(styleOptions?.userBubbleColor, styleOptions?.userBubbleOpacity, '#FF7A00', 1)
      : toRgba(styleOptions?.aiBubbleColor, styleOptions?.aiBubbleOpacity, '#1f2937', 0.9);
  }

  // Navigation: keep all messages visible but track a highlighted one (AI only)
  const [activeIndex, setActiveIndex] = useState(Math.max(messages.length - 1, 0));
  const messageRefs = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    setActiveIndex(Math.max(messages.length - 1, 0));
    // Ensure newest is visible
    const el = messageRefs.current[Math.max(messages.length - 1, 0)];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [messages, group.id]);

  // Inline edit state for AI messages
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editingHeight, setEditingHeight] = useState<number | null>(null);
  const [editingWidth, setEditingWidth] = useState<number | null>(null);

  const startEdit = () => {
    if (isUser) return;
    if (!canModify) return; // Only allow editing on latest AI message/group
    const index = Math.max(messages.length - 1, 0);
    const current = messages[index];
    if (!current || current.id === 'streaming-temp') return;
    // Broadcast begin-edit to ensure only one message is edited at a time globally
  const beginEditEvent: ChatAiBeginEditEvent = new CustomEvent(BEGIN_EDIT_EVENT, { detail: { groupId: group.id, messageId: current.id } });
  window.dispatchEvent(beginEditEvent);
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

  const cancelEdit = useCallback(() => {
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
      const { error } = await updateMessageContent(target.id, editValue);
      if (error) throw error;
      toast({ title: 'Updated', description: 'Message edited successfully.' });
      cancelEdit();
      // Realtime should update the UI; if not, the next refresh will
    } catch (err: unknown) {
      const description = err instanceof Error ? err.message : 'Failed to save edit';
      toast({ title: 'Error', description, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const onKeyDownEditor: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  // Close edit when clicking outside the currently edited bubble or its controls
  useEffect(() => {
    if (editingIndex === null) return;
    const handlePointerDown = (e: PointerEvent) => {
      const container = messageRefs.current[editingIndex];
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
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
  useEffect(() => {
    const onBeginEdit: EventListener = (event) => {
      const detail = (event as ChatAiBeginEditEvent).detail;
      const sourceGroupId = detail?.groupId;
      if (!sourceGroupId) return;
      if (sourceGroupId !== group.id && editingIndex !== null) {
        cancelEdit();
      }
    };
    window.addEventListener(BEGIN_EDIT_EVENT, onBeginEdit);
    return () => window.removeEventListener(BEGIN_EDIT_EVENT, onBeginEdit);
  }, [group.id, editingIndex, cancelEdit]);

  // Action handlers: regenerate (restricted to last message only)
  const handleRegenerate = () => {
    if (isUser || editingIndex !== null) return;
    if (!canModify) return; // Only allow regenerate on latest AI message/group
    const current = messages[Math.max(messages.length - 1, 0)];
    if (!current) return;
    const ev = new CustomEvent<{ messageId: string }>(REGENERATE_EVENT, { detail: { messageId: current.id } });
    window.dispatchEvent(ev);
  };

  // Subtle icon styles
  const iconClass = "w-4 h-4 text-white/60 hover:text-white transition-colors";
  const iconButtonClass = "p-1 rounded hover:bg-white/5 active:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed";

  // Determine if latest AI message in this group is regenerating
  const latestMessage = messages[messages.length - 1];
  const regenOverride = latestMessage && regeneratingContentByMessageId[latestMessage.id];
  const isRegenerating = regenOverride !== undefined;
  const [animationStage, setAnimationStage] = useState(0);
  useEffect(() => {
    if (!isRegenerating) return;
    const id = setInterval(() => setAnimationStage(s => (s + 1) % 3), 450);
    return () => clearInterval(id);
  }, [isRegenerating]);
  const displayContentFor = (msg: Message) => {
    const override = regeneratingContentByMessageId[msg.id];
    if (override === undefined) return msg.content;
    if (override.length === 0) return `Regenerating${'.'.repeat(animationStage + 1)}`;
    return override;
  };

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
  {/* Layout container: force side-by-side (row) for AI groups even on mobile so streaming starts beside avatar */}
  <div className={`flex gap-3 ${avatarStyle === 'classic' ? (!isUser ? 'flex-row' : 'sm:flex-row flex-col') : ''}`}>
        {/* Left avatar for AI messages (classic style only, hidden on mobile) */}
        {(!isUser && showLeftAvatar && avatarStyle === 'classic') && (
          <Avatar className={`hidden sm:flex ${mobileAvatarSizeClass} flex-shrink-0 ${avatarShapeClass}`}>
            <AvatarImage src={character.avatar} alt={character.name} className="object-cover" />
            <AvatarFallback>{character.name?.[0] || 'A'}</AvatarFallback>
          </Avatar>
        )}
        <div className={`flex flex-col gap-1 max-w-[80%] sm:max-w-[80%] ${isUser ? 'items-end ml-auto' : 'items-start'} w-full`} style={{ maxWidth: '90%' }}>
          {messages.map((message, index) => {
            // Bubble background style (avatar inside bubble). AI: float-left (wrap then full width). User: flex so text never goes under avatar.
            if (avatarStyle === 'bubble-bg') {
              const hasAvatar = isUser ? !!resolvedUserAvatarUrl : !!character.avatar;
              if (hasAvatar) {
                const bgColor = isUser
                  ? toRgba(styleOptions?.userBubbleColor, styleOptions?.userBubbleOpacity, '#FF7A00', 1)
                  : toRgba(styleOptions?.aiBubbleColor, styleOptions?.aiBubbleOpacity, '#1f2937', 0.9);
                const imageUrl = isUser ? (resolvedUserAvatarUrl as string) : (character.avatar as string);
                if (isUser) {
                  // USER SIDE: avatar on right, text on left, no wrapping under avatar
                  return (
                    <div
                      key={message.id === 'streaming-temp' ? `${message.id}-${message.content.length}` : message.id}
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
                            content={displayContentFor(message)}
                            className={`whitespace-pre-wrap select-text message-content ${regeneratingContentByMessageId?.[message.id] ? 'animate-pulse' : ''}`}
                            settingsOverride={globalSettingsOverride}
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
                // AI SIDE (updated: float avatar so long content wraps beneath; streaming starts beside avatar)
                const avatarMask = 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 62%, rgba(0,0,0,0) 100%)';
                return (
                  <div
                    ref={(el) => { messageRefs.current[index] = el; }}
                    key={message.id === 'streaming-temp' ? `${message.id}-${message.content.length}` : message.id}
                    className={`relative ${sizeClass} ${
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
                    {/* Floated avatar panel */}
                    <div
                      className="float-left w-[5.6rem] h-[7rem] md:w-32 md:h-40 bg-center bg-cover mr-5 md:mr-7 mb-2 md:mb-3"
                        style={{
                          backgroundImage: `url(${imageUrl})`,
                          maskImage: avatarMask,
                          WebkitMaskImage: avatarMask,
                        }}
                    />
                    {/* Text/content block flows to the right of avatar until it exceeds avatar height, then wraps beneath */}
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
                            content={displayContentFor(message)}
                            className={`whitespace-pre-wrap select-text message-content ${regeneratingContentByMessageId?.[message.id] ? 'animate-pulse' : ''}`}
                            settingsOverride={globalSettingsOverride}
                          />
                        </span>
                      )}
                    </div>
                    {/* Clear float so following layout (e.g., action bars) starts below full bubble */}
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
                      content={displayContentFor(message)}
                      className={`whitespace-pre-wrap select-text message-content ${regeneratingContentByMessageId?.[message.id] ? 'animate-pulse' : ''}`}
                      settingsOverride={globalSettingsOverride}
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
            const rightActions = (() => {
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