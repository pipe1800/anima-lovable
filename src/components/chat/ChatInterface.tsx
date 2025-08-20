import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
// Removed greetingDismissedStore to ensure greeting selection UI always appears for each new chat session

import { Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { InsufficientCreditsModal } from './InsufficientCreditsModal';
import ChatMessages from './ChatMessages';
import { useAuth } from '@/contexts/AuthContext';
import { useChatUnified } from '@/hooks/useChatUnified';
import { useChatPerformance } from '@/hooks/useChatPerformance';
import type { TrackedContext } from '@/types/chat';
import { createChat } from '@/lib/chat-operations';
import { handleChatError } from '@/utils/chatErrorHandling';
import logger from '@/utils/logger';
import { type Persona } from '@/lib/persona-operations';
import { usePersonaById } from '@/queries/personaQueries';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/chatQueries';
import { useNavigate } from 'react-router-dom';
import { buildGreetingVariants } from '@/lib/greeting-utils'; // still used for initial variants (could swap to getGreetingVariants)
import { supabase } from '@/integrations/supabase/client';

// Removed AddonDebugPanel (no longer needed)

interface Character {
  id: string;
  name: string;
  tagline: string;
  avatar: string;
  fallback: string;
}

interface ChatInterfaceProps {
  character: Character;
  onFirstMessage: () => void;
  existingChatId?: string;
  trackedContext?: TrackedContext;
  onContextUpdate?: (context: TrackedContext) => void;
  selectedPersonaId?: string | null;
  selectedWorldInfoId?: string | null;
  onChatCreated?: (chatId: string) => void; // New callback for when chat is created
  onMessageSent?: () => Promise<void>; // New callback for when message is sent
  characterDetails?: any; // New: full character details including definition (for greeting variants)
  creditsBalanceOverride?: number; // Provided by parent to avoid duplicate fetches
  globalSettingsOverride?: any; // Provided by parent to avoid duplicate fetches
}

const ChatInterface = ({
  character,
  onFirstMessage,
  existingChatId,
  trackedContext: parentTrackedContext,
  onContextUpdate,
  selectedPersonaId: propSelectedPersonaId,
  selectedWorldInfoId,
  onChatCreated,
  onMessageSent,
  characterDetails,
  creditsBalanceOverride,
  globalSettingsOverride
}: ChatInterfaceProps) => {
  const [inputValue, setInputValue] = useState('');
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [currentChatId, setCurrentChatId] = useState<string | null>(existingChatId || null);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(propSelectedPersonaId || null);
  const { data: selectedPersonaData } = usePersonaById(selectedPersonaId);
  const [showInsufficientCreditsModal, setShowInsufficientCreditsModal] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [isPreChatPhase, setIsPreChatPhase] = useState(!existingChatId); // true until chat created
  const [sendingFirstMessage, setSendingFirstMessage] = useState(false);
  const [hasSentFirstUserMessage, setHasSentFirstUserMessage] = useState(!!existingChatId);
  const hasSentFirstUserMessageRef = useRef(hasSentFirstUserMessage);
  useEffect(() => { hasSentFirstUserMessageRef.current = hasSentFirstUserMessage; }, [hasSentFirstUserMessage]);

  // Phase machine: 'greeting' -> (user submits) 'creating' -> (after first user message queued) 'active'
  type ChatPhase = 'greeting' | 'creating' | 'active';
  const initialPhase: ChatPhase = existingChatId ? 'active' : 'greeting';
  const [chatPhase, setChatPhase] = useState<ChatPhase>(initialPhase);
  const chatPhaseRef = useRef(chatPhase); useEffect(()=>{ chatPhaseRef.current = chatPhase; }, [chatPhase]);

  // Defensive: if an existing chat id appears later, force active
  useEffect(() => {
    if (existingChatId && chatPhase !== 'active') {
      setChatPhase('active');
    }
  }, [existingChatId, chatPhase]);

  // Ensure that once currentChatId is set we always leave pre-chat (legacy flag) and phase >= creating
  useEffect(() => {
    if (currentChatId && chatPhase === 'creating') {
      // remain creating until first user message dispatched -> then active
      return;
    }
  }, [currentChatId, chatPhase]);

  // Greeting variants (available before chat creation)
  const greetingVariants = React.useMemo(() => buildGreetingVariants((characterDetails as any) || (character as any)), [characterDetails, character]);
  const hasMultipleGreetings = greetingVariants.length > 1;

  // Input ref now supports textarea for multi-line user input (chat-like behavior)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  // Stable logger instance so effects depending on it don't re-run every render
  const log = React.useRef(logger.scoped('ChatInterface')).current;
  // Track whether the user intentionally dismissed the keyboard (mobile UX smoothing)
  const userDismissedKeyboardRef = useRef(false);
  const programmaticFocusRef = useRef(false);
  const isProbablyMobile = React.useMemo(() => {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /Mobi|Android|iPhone|iPad|iPod/i.test(ua) || window.innerWidth < 768;
  }, []);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Variant navigation state per AI message id (post-creation regenerations)
  const [variantIndexByMessage, setVariantIndexByMessage] = useState<Record<string, number>>({});
  // const [selectedGreetingIndex, setSelectedGreetingIndex] = useState(0); // replaced with stable ref-based init to avoid flicker
  const initialGreetingIndexRef = useRef<number | null>(null);
  const [selectedGreetingIndex, setSelectedGreetingIndex] = useState<number>(() => 0); // will be set once variants known
  const [greetingPersisted, setGreetingPersisted] = useState(false);

  // Greeting carousel controls (pre-chat)
  const handleNextGreeting = () => {
    if (!hasMultipleGreetings) return;
    setSelectedGreetingIndex(i => (i + 1) % greetingVariants.length);
  };
  const handlePrevGreeting = () => {
    if (!hasMultipleGreetings) return;
    setSelectedGreetingIndex(i => (i - 1 + greetingVariants.length) % greetingVariants.length);
  };

  // Listen for auto-summary success events and show notification
  useEffect(() => {
    const handleAutoSummary = (event: CustomEvent) => {
      log.info('Auto-summary notification received:', event.detail);
      toast({
        title: "🧠 New Memory Added",
        description: "Conversation automatically summarized to maintain performance.",
        duration: 5000,
      });
    };

    window.addEventListener('autoSummarySuccess', handleAutoSummary as EventListener);
    
    return () => {
      window.removeEventListener('autoSummarySuccess', handleAutoSummary as EventListener);
    };
  }, [toast, log]);

  // Auto-select a random greeting index initially if multiple (purely visual pre-chat)
  // REPLACED: previous effect caused flicker (initial 0 then random). Now we set once after variants resolved.
  useEffect(() => {
    if (initialGreetingIndexRef.current === null) {
      initialGreetingIndexRef.current = (!existingChatId && greetingVariants.length > 1)
        ? Math.floor(Math.random() * greetingVariants.length)
        : 0;
      setSelectedGreetingIndex(initialGreetingIndexRef.current);
    }
  }, [existingChatId, greetingVariants]);

  // Unified chat hook
  const {
    messages,
    isTyping,
    trackedContext: unifiedTrackedContext,
    sendMessage,
    creditsBalance,
    isLoadingMessages,
    hasMore,
    isFetchingNextPage,
    fetchNextPage,
    isRealtimeConnected,
    debugInfo,
    isStreaming,
    streamingMessage
  } = useChatUnified(currentChatId, character.id, {
    skipCreditsFetch: typeof creditsBalanceOverride === 'number',
    externalCreditsBalance: creditsBalanceOverride,
    externalGlobalSettings: globalSettingsOverride
  });
  // Broadcast message count to parent layout (replaces separate HEAD count query)
  useEffect(() => {
    if (!currentChatId) return;
    try {
      const ev = new CustomEvent('chat-messages-updated', { detail: { chatId: currentChatId, count: messages.length } });
      window.dispatchEvent(ev);
    } catch {}
  }, [messages.length, currentChatId]);
  // Reintroduce effectiveTrackedContext (was removed during duplicate cleanup)
  const effectiveTrackedContext = parentTrackedContext || unifiedTrackedContext;
  // Derived: whether any user message exists in this chat (used to lock greeting picker)
  const hasUserMessage = React.useMemo(() => {
    if (!messages || messages.length === 0) return false;
    return messages.some((m: any) => {
      // Treat anything that is NOT explicitly an AI message as user (covers null / undefined backend values)
      if (m.is_ai_message === true) return false;
      if (m.isUser === true) return true;
      if (m.role === 'user') return true;
      // If backend omits is_ai_message for user messages, count those with a user_id / without is_ai_message true
      if (m.user_id && m.is_ai_message !== true) return true;
      return false;
    });
  }, [messages]);
  // Guard: only evaluate greeting sync after messages have loaded at least once
  const messagesLoaded = !!messages && messages.length > 0;
  useEffect(() => {
    if (!messagesLoaded || !currentChatId) return;
    if (hasUserMessage) return; // user already sent a message -> locked
    const firstAi = messages.find((m: any) => (m.is_ai_message === true) || (m.role === 'assistant') || (m.isUser === false));
    if (firstAi && typeof firstAi.content === 'string') {
      // Mark greeting persisted once we see first AI message
      if (!greetingPersisted) setGreetingPersisted(true);
      const idx = greetingVariants.indexOf(firstAi.content);
      if (idx >= 0 && idx !== selectedGreetingIndex) setSelectedGreetingIndex(idx);
    }
  }, [messagesLoaded, messages, currentChatId, hasUserMessage, greetingVariants, selectedGreetingIndex, greetingPersisted]);

  // ✅ FIX: Safety cleanup for stuck streaming states
  useEffect(() => {
    if (isStreaming) {
      const timeoutId = setTimeout(() => {
        log.warn('⚠️ Streaming timeout detected, clearing stuck state');
        // Force clear streaming state if it's been too long
      }, 30000);
      return () => clearTimeout(timeoutId);
    }
  }, [isStreaming, log]);

  // Performance monitoring
  const { updateMetrics } = useChatPerformance(currentChatId);

  // Addon settings
  // Use provided global settings override (avoids duplicate network fetches)
  const globalSettings = globalSettingsOverride;
  const backgroundImage = globalSettings?.background_image_url || null;
  const currentAddonSettings = globalSettings ? {
    dynamicWorldInfo: globalSettings.dynamic_world_info,
    enhancedMemory: globalSettings.enhanced_memory,
    moodTracking: globalSettings.mood_tracking,
    clothingInventory: globalSettings.clothing_inventory,
    locationTracking: globalSettings.location_tracking,
    timeAndWeather: globalSettings.time_and_weather,
    relationshipStatus: globalSettings.relationship_status,
    characterPosition: globalSettings.character_position,
    chainOfThought: globalSettings.chain_of_thought,
    fewShotExamples: globalSettings.few_shot_examples,
  } : {
    dynamicWorldInfo: false,
    enhancedMemory: false,
    moodTracking: false,
    clothingInventory: false,
    locationTracking: false,
    timeAndWeather: false,
    relationshipStatus: false,
    characterPosition: false,
    chainOfThought: false,
    fewShotExamples: false,
  };
  const streamingMode = (globalSettings?.streaming_mode || 'smooth') as 'smooth' | 'instant';
  // Style options for greeting bubble (mirror ChatMessages)
  const aiBubbleColor = globalSettings?.ai_bubble_color || '#1f2937';
  const aiBubbleOpacity = typeof globalSettings?.ai_bubble_opacity === 'number' ? globalSettings!.ai_bubble_opacity : 0.9;
  const aiTextColor = globalSettings?.ai_text_color || '#E5E7EB';
  const showCharacterAvatar = globalSettings?.show_character_avatar ?? true;
  const fontSizeClass = (() => {
    switch (globalSettings?.font_size) {
      case 'small': return 'text-sm';
      case 'large': return 'text-lg';
      default: return 'text-base';
    }
  })();
  const avatarStyle = (globalSettings?.avatar_style || 'classic') as 'classic' | 'bubble-bg' | 'portrait' | 'side-banner';
  const hexToRgba = (hex: string, opacity: number) => {
    const sanitized = hex.replace('#','');
    const bigint = parseInt(sanitized.length === 3 ? sanitized.split('').map(c=>c+c).join('') : sanitized,16);
    const r = (bigint >> 16) & 255; const g = (bigint >> 8) & 255; const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

  // Ensure that once currentChatId is set we always leave pre-chat (defensive)
  useEffect(() => {
    if (currentChatId && isPreChatPhase) {
      log.debug('🚪 Exiting pre-chat because currentChatId is now set', { currentChatId });
      setIsPreChatPhase(false);
    }
  }, [currentChatId, isPreChatPhase, log]);

  // Helper: create chat with chosen greeting THEN send first user message (reordered after dependencies)
  // Removed waitForGreetingPersistence polling; rely on realtime + unified message cache

  const createChatAndSendFirstMessage = useCallback(async (userMessage: string) => {
    if (!user || currentChatId || sendingFirstMessage) return;
    setSendingFirstMessage(true);
    try {
      setIsCreatingChat(true);
      log.info('[FLOW 1] Deferred chat creation start');
      const chosenGreeting = greetingVariants[selectedGreetingIndex] || null;
      const { chatId: newChatId } = await createChat({
        characterId: character.id,
        characterName: character.name,
        selectedPersonaId: propSelectedPersonaId || null,
        greeting: chosenGreeting
      });
      log.info('[FLOW 2] Chat created', { newChatId });
      setCurrentChatId(newChatId);
      window.history.replaceState(null, '', `/chat/${character.id}/${newChatId}`);
      onChatCreated?.(newChatId);

  // Skip greeting polling; first AI message arrives via realtime and unified hook
  try { await queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(newChatId) }); } catch {}

      // Now hide greeting bubble deterministically only after attempt to show persisted greeting
      if (chatPhase === 'greeting') {
        setChatPhase('creating');
      }

      log.info('[FLOW 3] Sending first user message');
      await sendMessage(
        userMessage,
        currentAddonSettings,
        selectedPersonaId,
        selectedWorldInfoId,
        effectiveTrackedContext,
        newChatId
      );
      log.info('[FLOW 4] First user message dispatched');
      setIsFirstMessage(false);
      setChatPhase('active');
      setHasSentFirstUserMessage(true);
      onFirstMessage();
    } catch (error: any) {
      log.error('[FLOW X] Error in deferred creation path', error);
      const chatError = handleChatError(error, 'creating chat', false);
      toast({ title: 'Error', description: chatError.message, variant: 'destructive' });
      if (!currentChatId) {
        setChatPhase('greeting');
        setHasSentFirstUserMessage(false);
      }
    } finally {
      setIsCreatingChat(false);
      setSendingFirstMessage(false);
    }
  }, [user, currentChatId, sendingFirstMessage, greetingVariants, selectedGreetingIndex, log, character.id, character.name, propSelectedPersonaId, currentAddonSettings, selectedPersonaId, selectedWorldInfoId, effectiveTrackedContext, onChatCreated, sendMessage, onFirstMessage, toast, chatPhase, queryClient]);

  // Sync tracked context with parent
  useEffect(() => {
    if (effectiveTrackedContext && onContextUpdate) {
      const hasValidParentContext = Object.values(parentTrackedContext).some(value => value !== 'No context');
      const hasValidEffectiveContext = Object.values(effectiveTrackedContext).some(value => value !== 'No context');
      
      if (!hasValidParentContext && hasValidEffectiveContext) {
        log.debug('Syncing context to parent (parent has no valid context):', {
          from: parentTrackedContext,
          to: effectiveTrackedContext
        });
        onContextUpdate(effectiveTrackedContext);
      } else if (hasValidParentContext && hasValidEffectiveContext) {
        const isContextDifferent = (
          parentTrackedContext.moodTracking !== effectiveTrackedContext.moodTracking ||
          parentTrackedContext.clothingInventory !== effectiveTrackedContext.clothingInventory ||
          parentTrackedContext.locationTracking !== effectiveTrackedContext.locationTracking ||
          parentTrackedContext.timeAndWeather !== effectiveTrackedContext.timeAndWeather ||
          parentTrackedContext.relationshipStatus !== effectiveTrackedContext.relationshipStatus ||
          parentTrackedContext.characterPosition !== effectiveTrackedContext.characterPosition
        );

        if (isContextDifferent) {
          log.debug('Syncing context to parent (contexts differ):', {
            from: parentTrackedContext,
            to: effectiveTrackedContext
          });
          onContextUpdate(effectiveTrackedContext);
        }
      }
    }
  }, [effectiveTrackedContext, parentTrackedContext, onContextUpdate, log]);

  // Initialize chat for existing chat
  useEffect(() => {
    if (existingChatId) {
      setHasSentFirstUserMessage(true);
      setIsPreChatPhase(false);
    }
  }, [existingChatId]);

  // Focus input on mount only on desktop (avoid auto keyboard pop on mobile like WhatsApp)
  useEffect(() => {
    if (!isProbablyMobile) {
      inputRef.current?.focus();
    }
  }, [isProbablyMobile]);

  // Removed: automatic refocus after AI finishes (prevents unwanted keyboard reopen on mobile)
  // If needed for desktop later, can reintroduce gated by !userDismissedKeyboardRef.current && !isProbablyMobile

  // Sync selected persona when prop changes
  useEffect(() => {
    if (propSelectedPersonaId !== undefined) {
      log.debug('🔄 ChatInterface: Persona prop changed to:', propSelectedPersonaId);
      setSelectedPersonaId(propSelectedPersonaId);
    }
  }, [propSelectedPersonaId, log]);

  // Persona data now delivered by react-query cache (removed manual effect)

  // Send message
  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !user) return;
    // Capture if user wanted keyboard open at send time
    const wasFocused = document.activeElement === inputRef.current && !userDismissedKeyboardRef.current;
    const focusBackIfNeeded = () => {
      if (!wasFocused) return; // user had dismissed or not focused -> don't resurrect
      if (userDismissedKeyboardRef.current) return; // user dismissed in interim
      programmaticFocusRef.current = true;
      requestAnimationFrame(() => {
        if (!userDismissedKeyboardRef.current) {
          inputRef.current?.focus();
        }
        programmaticFocusRef.current = false;
      });
    };
    if (!currentChatId) {
      const firstMsg = inputValue;
      setInputValue('');
      await createChatAndSendFirstMessage(firstMsg);
      focusBackIfNeeded();
      return;
    }
    if (!currentChatId) return;

    // Check if user has enough credits
    if (creditsBalance < 1) {
  log.warn('[Credits] Block send: creditsBalance < 1', { creditsBalance, userId: user?.id });
      setShowInsufficientCreditsModal(true);
      return;
    }

    const messageContent = inputValue;
    setInputValue('');
    const startTime = Date.now();

    try {
      await sendMessage(
        messageContent,
        currentAddonSettings,
        selectedPersonaId,
        selectedWorldInfoId,
        effectiveTrackedContext
      );

      // Proactively force scroll in case layout shift (quick manual assist; primary logic lives in ChatMessages)
      try {
        requestAnimationFrame(() => {
          const scroller = document.querySelector('.chat-messages-container');
          if (scroller) {
            (scroller as HTMLElement).scrollTop = (scroller as HTMLElement).scrollHeight;
            requestAnimationFrame(() => { (scroller as HTMLElement).scrollTop = (scroller as HTMLElement).scrollHeight; });
          } else {
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
          }
        });
      } catch {}

  // Only refocus if user had keyboard open
  focusBackIfNeeded();

      if (onMessageSent) await onMessageSent();

      // Update metrics
      const endTime = Date.now();
      updateMetrics(endTime - startTime);

      if (isFirstMessage) {
        setIsFirstMessage(false);
        setHasSentFirstUserMessage(true);
        setChatPhase('active');
        onFirstMessage();
      }

    } catch (error: any) {
      console.error('Error sending message:', error);
      updateMetrics(Date.now() - startTime, true);
      
      if (error.message?.includes('Authentication failed') || error.message?.includes('401')) {
        toast({
          title: "Authentication Error",
          description: "Your session has expired. Please refresh the page and sign in again.",
          variant: "destructive",
        });
        setTimeout(() => { window.location.reload(); }, 3000);
      } else if (error.message?.includes('Insufficient credits')) {
        setShowInsufficientCreditsModal(true);
      } else if (error.message?.includes('Server error')) {
        toast({ title: "Service Temporarily Unavailable", description: "Our servers are experiencing high load. Please try again in a moment.", variant: "destructive" });
      } else if (error.message?.includes('Chat service not found')) {
        toast({ title: "Service Unavailable", description: "The chat service is temporarily unavailable. Please try again later.", variant: "destructive" });
      } else {
        const chatError = handleChatError(error, 'sending message', false);
        toast({ title: "Error", description: chatError.message, variant: "destructive" });
      }
    }
  }, [inputValue, user, currentChatId, chatPhase, createChatAndSendFirstMessage, character.id, isFirstMessage, onFirstMessage, sendMessage, currentAddonSettings, selectedPersonaId, selectedWorldInfoId, effectiveTrackedContext, creditsBalance, toast, updateMetrics, onMessageSent]);

  // Pre-chat greeting selection simply updates index; actual greeting persisted on create
  const handleSelectGreeting = useCallback((idx: number) => {
    setSelectedGreetingIndex(idx);
  }, []);

  // Debug info logging
  useEffect(() => {
    if (debugInfo) {
      log.info('Debug Info:', debugInfo);
    }
  }, [debugInfo, log]);

  // Helper to trigger a variant generation (keeps previous AI message)
  const regenerateLastAI = useCallback(async (keepPrevious: boolean) => {
    if (!user || !currentChatId) {
      throw new Error('No active chat');
    }
    if (creditsBalance < 1) throw new Error('Insufficient credits');
  log.warn('[Credits] Regeneration blocked due to low credits', { creditsBalance, userId: user?.id });
    // Derive last user message from cached messages (avoid extra select)
    const all = messages || [];
    const lastUser = [...all].reverse().find(m => (m as any).is_ai_message === false || (m as any).isUser === true || (m as any).role === 'user');
    if (!lastUser || typeof (lastUser as any).content !== 'string' || !(lastUser as any).content.trim()) {
      console.warn('No last user message found in cache to regenerate');
      throw new Error('No previous user message to regenerate');
    }

    const payload = {
      operation: 'send-message',
      // IDs (both cases)
      chatId: currentChatId,
      chat_id: currentChatId,
      characterId: character.id,
      character_id: character.id,
      // Use the previous user message to trigger a new AI response
  message: (lastUser as any).content as string,
      // settings (both cases to be safe)
      addonSettings: currentAddonSettings,
      addon_settings: currentAddonSettings,
      selectedPersonaId: selectedPersonaId ?? null,
      selected_persona_id: selectedPersonaId ?? null,
      selectedWorldInfoId: selectedWorldInfoId ?? null,
      selected_world_info_id: selectedWorldInfoId ?? null,
      // regenerate hints (optional for backend; harmless if ignored)
      regenerate: true,
      regenerateLast: true,
      regenerate_last: true,
      keepPrevious: keepPrevious,
      keep_previous: keepPrevious,
    } as any;

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) {
        throw new Error('Authentication failed');
      }
      const token = sessionData.session.access_token;

      // Use direct fetch like the streaming path to avoid any differences in payload handling
      const { SUPABASE_API_URL } = await import('@/integrations/supabase/client');
      const resp = await fetch(`${SUPABASE_API_URL}/functions/v1/chat-management`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_ANON_KEY as any,
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.warn('regenerateLastAI request failed', { status: resp.status, text, payload });
        if (resp.status === 402) throw new Error('Insufficient credits');
        throw new Error(text || `Request failed: ${resp.status}`);
      }
      return;
    } catch (err) {
      throw err;
    }
  }, [user, currentChatId, creditsBalance, character.id, currentAddonSettings, selectedPersonaId, selectedWorldInfoId, messages]);

  // Regeneration UI map: messageId -> streaming content
  const [regeneratingContentById, setRegeneratingContentById] = useState<Record<string, string>>({});
  // Ref mirror for async watchers
  const regeneratingContentByIdRef = useRef(regeneratingContentById);
  useEffect(() => { regeneratingContentByIdRef.current = regeneratingContentById; }, [regeneratingContentById]);
  // Track start times for regeneration attempts (for fallback timeouts)
  const regenerationStartRef = useRef<Record<string, number>>({});

  const regenerateMessageById = useCallback(async (aiMessageId: string) => {
    if (!user || !currentChatId) return;
    if (creditsBalance < 1) { setShowInsufficientCreditsModal(true); return; }
    try {
      // Show placeholder
      setRegeneratingContentById(prev => ({ ...prev, [aiMessageId]: '' }));
  regenerationStartRef.current[aiMessageId] = Date.now();

      // Auth
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) throw new Error('Authentication failed');
      const token = sessionData.session.access_token;

      // Request
      const { SUPABASE_API_URL } = await import('@/integrations/supabase/client');
      const resp = await fetch(`${SUPABASE_API_URL}/functions/v1/chat-management`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_ANON_KEY as any,
        },
        body: JSON.stringify({
          operation: 'regenerate-message',
          chatId: currentChatId,
          characterId: character.id,
          aiMessageId,
          addonSettings: currentAddonSettings,
          selectedPersonaId: selectedPersonaId ?? null,
          selectedWorldInfoId: selectedWorldInfoId ?? null,
        }),
      });
      if (!resp.ok || !resp.body) {
        const text = await resp.text();
        throw new Error(text || `Regenerate failed: ${resp.status}`);
      }

      // Stream
      const reader = resp.body.getReader();
      const { StreamingMessageParser, parseSSEMessage } = await import('@/lib/streaming-utils');
      const parser = new StreamingMessageParser();
      let full = '';
      const scheduleAppend = async (text: string) => {
        if (!text) return;
        if (streamingMode !== 'smooth') { full += text; return; }
        const chunk = 24;
        for (let i = 0; i < text.length; i += chunk) {
          full += text.slice(i, i + chunk);
          setRegeneratingContentById(prev => ({ ...prev, [aiMessageId]: full }));
          await new Promise(r => setTimeout(r, 16));
        }
      };
      const startTime = Date.now();
      let doneFlag = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const dataLines = parser.parseChunk(value);
        for (const data of dataLines) {
          const obj = parseSSEMessage(data);
            if (!obj) continue;
            if (obj.done === true) { doneFlag = true; if (streamingMode === 'instant' && full) setRegeneratingContentById(prev => ({ ...prev, [aiMessageId]: full })); break; }
            if (typeof obj?.content === 'string') await scheduleAppend(obj.content);
            else if (obj?.choices?.[0]?.delta?.content) await scheduleAppend(obj.choices[0].delta.content as string);
        }
        if (doneFlag) break;
        if (Date.now() - startTime > 30000) { console.warn('Regeneration stream timeout'); break; }
      }
      // Ensure full content is stored in override (final streamed text)
      if (full) {
        setRegeneratingContentById(prev => ({ ...prev, [aiMessageId]: full }));
      }

      // Optimistically patch React Query cache so the updated content appears immediately
      if (currentChatId && full) {
        const key = queryKeys.chat.messages(currentChatId);
        queryClient.setQueryData(key, (old: any) => {
          if (!old) return old;
            // Support both paginated (infinite) and flat shapes
            if (Array.isArray(old)) {
              return old.map((m: any) => m.id === aiMessageId ? { ...m, content: full, updated_at: new Date().toISOString() } : m);
            }
            if (old.pages) {
              return {
                ...old,
                pages: old.pages.map((p: any) => ({
                  ...p,
                  messages: p.messages?.map((m: any) => m.id === aiMessageId ? { ...m, content: full, updated_at: new Date().toISOString() } : m)
                }))
              };
            }
            if (old.messages) {
              return {
                ...old,
                messages: old.messages.map((m: any) => m.id === aiMessageId ? { ...m, content: full, updated_at: new Date().toISOString() } : m)
              };
            }
          return old;
        });
      }

      // Schedule override removal shortly after optimistic patch so pulse/animation stops
      setTimeout(() => {
        setRegeneratingContentById(prev => {
          if (!(aiMessageId in prev)) return prev;
          const { [aiMessageId]: _, ...rest } = prev;
          return rest;
        });
      }, 300);

      // Background invalidate to reconcile with backend authoritative state (non-blocking)
      if (currentChatId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(currentChatId) });
        if (user?.id) queryClient.invalidateQueries({ queryKey: queryKeys.user.credits(user.id) });
        // Schedule a second invalidate shortly after to pick up async addon context extraction (regeneration)
        setTimeout(() => {
          try { queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(currentChatId) }); } catch {}
        }, 1200);
      }
    } catch (err: any) {
      console.error('Regenerate failed:', err);
      // Clear override on failure
      setRegeneratingContentById(prev => { 
        const { [aiMessageId]: _, ...rest } = prev; 
        return rest; 
      });
      if (err?.message?.includes('credits')) {
        setShowInsufficientCreditsModal(true);
      } else {
        toast({ 
          title: 'Error', 
          description: err.message || 'Failed to regenerate message', 
          variant: 'destructive' 
        });
      }
    }
  }, [user, currentChatId, creditsBalance, currentAddonSettings, selectedPersonaId, selectedWorldInfoId, character.id, streamingMode, queryClient, toast]);

  // --- Responsive typing/streaming indicator control ---
  // Track stream progress to detect stagnation (backend slow to flip isStreaming false)
  const streamProgressRef = useRef<{len:number; ts:number}>({ len: 0, ts: 0 });
  const [, forceRerenderTick] = useState(0); // to trigger re-render when stagnation threshold reached
  useEffect(() => {
    if (isStreaming && streamingMessage) {
      const l = streamingMessage.length;
      if (l !== streamProgressRef.current.len) {
        streamProgressRef.current = { len: l, ts: Date.now() };
      }
    }
  }, [isStreaming, streamingMessage]);
  // Periodic check (cheap) every 1s while streaming to hide if stagnated
  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => {
      forceRerenderTick(t => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [isStreaming]);
  // Determine last AI message content
  const lastAiMessageContent = React.useMemo(() => {
    if (!messages || !messages.length) return '';
    for (let i = messages.length - 1; i >= 0; i--) {
      const m: any = messages[i];
      if (m && (m.is_ai_message === true || m.isUser === false || m.role === 'assistant')) {
        return typeof m.content === 'string' ? m.content : '';
      }
    }
    return '';
  }, [messages]);
  const streamingCompleteMatch = !!(isStreaming && streamingMessage && lastAiMessageContent && lastAiMessageContent === streamingMessage);
  const stagnated = isStreaming && !streamingCompleteMatch && (Date.now() - streamProgressRef.current.ts > 2000) && streamProgressRef.current.len > 0;
  const showRespondingIndicator = isTyping || (isStreaming && !streamingCompleteMatch && !stagnated);

  // Reconcile regeneration overrides: clear when message matches or vanished or timeout
  useEffect(() => {
    if (!messages || !messages.length) return;
    setRegeneratingContentById(prev => {
      if (!prev || Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(prev)) {
        const msg = (messages as any).find((m: any) => m.id === id);
        const override = prev[id];
        if (!msg) { delete next[id]; changed = true; continue; }
        // If backend content now equals our override (final persisted) OR backend has any content while override was placeholder
        if ((override === '' && msg.content && msg.content.length > 0) || (override && msg.content === override)) {
          delete next[id]; changed = true; continue; }
        // Safety timeout (25s)
        const started = regenerationStartRef.current[id];
        if (started && Date.now() - started > 25000) { delete next[id]; changed = true; continue; }
      }
      return changed ? next : prev;
    });
  }, [messages]);

  // Keep latest regenerate function in a ref to avoid stale closures in global event listeners
  const regenerateLastAIRef = useRef(regenerateLastAI);
  useEffect(() => {
    regenerateLastAIRef.current = regenerateLastAI;
  }, [regenerateLastAI]);

  // Variant navigation handlers (inline editing handled within MessageGroup UI)
  useEffect(() => {
    const onRegenerate = async (e: any) => {
      const messageId = e?.detail?.messageId as string | undefined;
      if (!messageId || !currentChatId) return;
      // Enforce: only last AI message can be regenerated
      const lastAi = (() => {
        for (let i = (messages?.length || 0) - 1; i >= 0; i--) {
          const m = messages[i] as any;
          if (m && !m.isUser) return m;
        }
        return null as any;
      })();
      if (!lastAi || lastAi.id !== messageId) {
        return; // ignore attempts on older AI messages
      }
      await regenerateMessageById(messageId);
    };
    const onVariantNext = async (_e: any) => {
      try {
        await regenerateLastAIRef.current?.(true);
      } catch (err: any) {
        if (err?.message?.includes('credits')) setShowInsufficientCreditsModal(true);
      }
    };
    const onVariantPrev = (_e: any) => {
      setVariantIndexByMessage((prev) => prev);
    };

    window.addEventListener('chat-ai-regenerate' as any, onRegenerate as any);
    window.addEventListener('chat-ai-variant-next' as any, onVariantNext as any);
    window.addEventListener('chat-ai-variant-prev' as any, onVariantPrev as any);
    return () => {
      window.removeEventListener('chat-ai-regenerate' as any, onRegenerate as any);
      window.removeEventListener('chat-ai-variant-next' as any, onVariantNext as any);
      window.removeEventListener('chat-ai-variant-prev' as any, onVariantPrev as any);
    };
  }, [currentChatId, regenerateMessageById, messages]);

  const handleUpgrade = () => {
    navigate('/subscription');
  };

  const handleCloseInsufficientCreditsModal = () => {
    setShowInsufficientCreditsModal(false);
  };

  // Show loading state while chat is being initialized
  if (!currentChatId && !isLoadingMessages) {
    // Removed early return to allow pre-chat greeting & input before chat creation
  }

  // Pre-chat carousel UI
  const renderPreChatGreeting = () => {
    if (!isPreChatPhase) return null;
    if (greetingVariants.length === 0) return null;
    const currentGreeting = greetingVariants[selectedGreetingIndex] || '';

    return (
      <div className="px-4 pt-4">
        <div className="flex items-start gap-3 max-w-3xl">
          {/* Avatar placeholder to mimic AI bubble layout */}
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#1f1f1f] border border-white/10 flex items-center justify-center shrink-0">
            <img
              src={character.avatar}
              alt={character.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
          <div className="flex-1">
            <div className="inline-flex flex-col gap-2 bg-[#1f2937]/90 border border-white/10 rounded-2xl px-4 py-3 shadow-md relative group">
              {hasMultipleGreetings && (
                <div className="absolute -top-2 right-2 flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={handlePrevGreeting}
                    disabled={isCreatingChat || sendingFirstMessage}
                    className="text-xs px-2 py-1 rounded-md bg-black/40 hover:bg-black/60 border border-white/10 disabled:opacity-30"
                    aria-label="Previous greeting"
                  >
                    ◀
                  </button>
                  <span className="text-[10px] text-gray-400 select-none">
                    {selectedGreetingIndex + 1}/{greetingVariants.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextGreeting}
                    disabled={isCreatingChat || sendingFirstMessage}
                    className="text-xs px-2 py-1 rounded-md bg-black/40 hover:bg-black/60 border border-white/10 disabled:opacity-30"
                    aria-label="Next greeting"
                  >
                    ▶
                  </button>
                </div>
              )}
              <div className="text-sm whitespace-pre-wrap leading-relaxed text-gray-100">
                {currentGreeting}
              </div>
              {hasMultipleGreetings && (
                <div className="flex justify-center gap-1 pt-1">
                  {greetingVariants.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectGreeting(i)}
                      disabled={isCreatingChat || sendingFirstMessage}
                      className={`h-1.5 w-1.5 rounded-full transition-colors ${i === selectedGreetingIndex ? 'bg-[#FF7A00]' : 'bg-gray-600 hover:bg-gray-500'}`}
                      aria-label={`Select greeting variant ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="mt-1 ml-1 text-[10px] text-gray-500">
              {(isCreatingChat || sendingFirstMessage) && 'Creating chat…'}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Pre-chat (and pre-first-user-message) greeting bubble styled like AI message
  const renderGreetingBubble = () => {
    if (chatPhase !== 'greeting') return null;
    // Removed greetingDismissedStore.has(character.id) check so greeting always shows for new chat
    if (greetingVariants.length === 0) return null;
    const currentGreeting = greetingVariants[selectedGreetingIndex] || '';
    const helperText = (isCreatingChat || sendingFirstMessage)
      ? 'Creating chat…'
      : '';
    // Derive name font size (message font +4px like normal AI messages)
    const tailwindFontPx: Record<string, number> = { 'text-sm': 14, 'text-base': 16, 'text-lg': 18 };
    const messageFontSizePx = tailwindFontPx[fontSizeClass] || 16;
    const nameFontSizePx = messageFontSizePx + 4;
    const rawName = character.name || '';
    const truncatedName = rawName.length > 15 ? rawName.slice(0,15) + '…' : rawName;

    // CLASSIC STYLE ---------------------------------------------------
    if (avatarStyle === 'classic' || avatarStyle === 'portrait' || avatarStyle === 'side-banner') {
      return (
        <div className="px-4 pt-4">
          <div className="flex items-start gap-3 max-w-3xl w-[90vw] sm:w-auto mx-auto">
            {showCharacterAvatar && (
              <div className="hidden sm:flex w-16 h-16 rounded-full overflow-hidden bg-[#1f1f1f] border border-white/10 items-center justify-center shrink-0">
                <img
                  src={character.avatar}
                  alt={character.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
            {/* Mobile avatar (matches MessageGroup) */}
            {showCharacterAvatar && (
              <div className="sm:hidden w-[3.3rem] h-[3.3rem] rounded-full overflow-hidden bg-[#1f1f1f] border border-white/10 flex items-center justify-center shrink-0">
                <img
                  src={character.avatar}
                  alt={character.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
            <div className="flex-1">
              <div
                className={`inline-flex flex-col gap-2 border border-white/10 rounded-2xl px-4 py-3 shadow-md relative group ${fontSizeClass}`}
                style={{ backgroundColor: hexToRgba(aiBubbleColor, aiBubbleOpacity), color: aiTextColor }}
              >
                <div className="font-semibold text-white/85 leading-none" style={{ fontSize: `${nameFontSizePx}px` }} title={rawName}>
                  {truncatedName}
                </div>
                <div className="whitespace-pre-wrap leading-relaxed" style={{ color: aiTextColor }}>
                  {currentGreeting}
                </div>
              </div>
              {hasMultipleGreetings && (
                <div className="mt-2 flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePrevGreeting}
                      disabled={isCreatingChat || sendingFirstMessage}
                      className="text-xs px-2 py-1 rounded-md bg-black/40 hover:bg-black/60 border border-white/10 disabled:opacity-30"
                      aria-label="Previous greeting"
                    >
                      ◀
                    </button>
                    <span className="text-[10px] text-gray-400 select-none">
                      {selectedGreetingIndex + 1}/{greetingVariants.length}
                    </span>
                    <button
                      type="button"
                      onClick={handleNextGreeting}
                      disabled={isCreatingChat || sendingFirstMessage}
                      className="text-xs px-2 py-1 rounded-md bg-black/40 hover:bg-black/60 border border-white/10 disabled:opacity-30"
                      aria-label="Next greeting"
                    >
                      ▶
                    </button>
                  </div>
                  <div className="flex justify-center gap-1">
                    {greetingVariants.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelectGreeting(i)}
                        disabled={isCreatingChat || sendingFirstMessage}
                        className={`h-1.5 w-1.5 rounded-full transition-colors ${i === selectedGreetingIndex ? 'bg-[#FF7A00]' : 'bg-gray-600 hover:bg-gray-500'}`}
                        aria-label={`Select greeting variant ${i + 1}`}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-1 ml-1 text-[10px] text-gray-500">
                {(isCreatingChat || sendingFirstMessage) && 'Creating chat…'}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // BUBBLE-BG STYLE -------------------------------------------------
    if (avatarStyle === 'bubble-bg') {
      const bgColor = hexToRgba(aiBubbleColor, aiBubbleOpacity);
      const showImagePanel = showCharacterAvatar && !!character.avatar;
      const avatarMask = 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 62%, rgba(0,0,0,0) 100%)';
      return (
        <div className="px-4 pt-4">
          <div className="flex items-start gap-3 max-w-5xl w-[90vw] sm:w-auto mx-auto">
            <div
              className={`relative ${fontSizeClass} border border-white/10 rounded-lg shadow-md w-full overflow-hidden`}
              style={{ backgroundColor: bgColor }}
            >
              {showImagePanel && (
                <div
                  className="float-left w-[5.6rem] h-[7rem] md:w-32 md:h-40 bg-center bg-cover mr-5 md:mr-7"
                  style={{
                    backgroundImage: `url(${character.avatar})`,
                    maskImage: avatarMask as any,
                    WebkitMaskImage: avatarMask as any,
                  }}
                />
              )}
              <div className={`${showImagePanel ? 'pt-2 pb-3 pr-4 pl-2 md:pl-4 min-h-[7rem]' : 'p-4'}`}>
                <div className="font-bold text-white/85 leading-tight mb-2" style={{ fontSize: `${nameFontSizePx}px` }} title={rawName}>
                  {truncatedName}
                </div>
                <div className="whitespace-pre-wrap leading-relaxed" style={{ color: aiTextColor }}>
                  {currentGreeting}
                </div>
              </div>
              <div className="clear-both" />
            </div>
            <div className="mt-1 ml-1 text-[10px] text-gray-500">
              {(isCreatingChat || sendingFirstMessage) && 'Creating chat…'}
            </div>
          </div>
          {hasMultipleGreetings && (
            <div className="mt-2 flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevGreeting}
                  disabled={isCreatingChat || sendingFirstMessage}
                  className="text-xs px-2 py-1 rounded-md bg-black/40 hover:bg-black/60 border border-white/10 disabled:opacity-30"
                  aria-label="Previous greeting"
                >
                  ◀
                </button>
                <span className="text-[10px] text-gray-300 select-none">
                  {selectedGreetingIndex + 1}/{greetingVariants.length}
                </span>
                <button
                  type="button"
                  onClick={handleNextGreeting}
                  disabled={isCreatingChat || sendingFirstMessage}
                  className="text-xs px-2 py-1 rounded-md bg-black/40 hover:bg-black/60 border border-white/10 disabled:opacity-30"
                  aria-label="Next greeting"
                >
                  ▶
                </button>
              </div>
              <div className="flex justify-center gap-1">
                {greetingVariants.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectGreeting(i)}
                    disabled={isCreatingChat || sendingFirstMessage}
                    className={`h-1.5 w-1.5 rounded-full transition-colors ${i === selectedGreetingIndex ? 'bg-[#FF7A00]' : 'bg-gray-600 hover:bg-gray-500'}`}
                    aria-label={`Select greeting variant ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    return null; // fallback
  };

  return (
    <div className="relative h-full bg-transparent">
      {/* Static background layer spanning entire chat area */}
      {backgroundImage && (
        <div
          className="absolute inset-0 bg-center bg-cover"
          style={{ backgroundImage: `url(${backgroundImage})` }}
        />
      )}
      {/* Dark overlay for readability */}
      {backgroundImage && (
        <div className="absolute inset-0 bg-black/50 pointer-events-none" />
      )}

      {/* Foreground content */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Debug Panel - Lazy loaded for performance */}
  {/* Debug panel previously rendered here; removed for optimization */}
        
        {/* Messages Area - Mobile Responsive */}
        <div className="flex-1 overflow-hidden">
          {/* Removed legacy greeting picker bar; unified into styled bubble */}
          {renderGreetingBubble()}
          {currentChatId && (
            <ChatMessages 
              chatId={currentChatId}
              character={character}
              trackedContext={effectiveTrackedContext}
              streamingMessage={isStreaming ? streamingMessage : undefined}
              isStreaming={isStreaming}
              messages={messages}
              hasMore={hasMore}
              isFetchingNextPage={isFetchingNextPage}
              isLoadingMessages={isLoadingMessages}
              fetchNextPage={fetchNextPage}
              isRealtimeConnected={isRealtimeConnected}
              debugInfo={debugInfo}
              renderBackground={false}
              userAvatarUrlOverride={selectedPersonaData?.avatar_url || undefined}
              regeneratingContentByMessageId={regeneratingContentById}
              globalSettingsOverride={globalSettings}
            />
          )}
        </div>

        {/* Input & Typing Indicator Container (anchored bottom) */}
        <div className="p-3 sm:p-4 bg-transparent">
          <div className="flex flex-col gap-1">
            <div
              aria-live="polite"
              role="status"
              className={`flex items-center gap-2 text-gray-400 px-1 transition-all duration-200 ease-out origin-bottom ${
                showRespondingIndicator
                  ? 'opacity-100 h-5 translate-y-0'
                  : 'opacity-0 h-0 -translate-y-1 pointer-events-none'
              }`}
            >
              <div className="flex space-x-1">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.12s' }}></div>
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.24s' }}></div>
              </div>
              <span className="text-xs sm:text-sm select-none">
                {isStreaming ? `${character.name} is responding...` : `${character.name} is typing...`}
              </span>
            </div>
            <form onSubmit={handleSendMessage} className="flex items-end gap-2 sm:gap-3">
            <div className="flex-1 backdrop-blur-md bg-black/30 border border-white/10 rounded-xl px-3 sm:px-4 py-2 sm:py-3 shadow-lg shadow-black/30">
              <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  // Auto-grow (reset height then set to scrollHeight)
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 180) + 'px'; // cap ~6 lines
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    // Send message on Enter (like WhatsApp); Shift+Enter inserts newline
                    e.preventDefault();
                    // Trigger form submit
                    (e.currentTarget.closest('form') as HTMLFormElement)?.requestSubmit();
                  }
                }}
                onFocus={() => { userDismissedKeyboardRef.current = false; }}
                onBlur={() => {
                  if (!programmaticFocusRef.current) {
                    userDismissedKeyboardRef.current = true;
                  }
                }}
                placeholder={`Message ${character.name.length > 40 ? character.name.slice(0,37) + '…' : character.name}...`}
                rows={1}
                autoComplete="off"
                autoCorrect="on"
                autoCapitalize="sentences"
                inputMode="text"
                className={`w-full bg-transparent outline-none resize-none overflow-y-auto leading-relaxed ${fontSizeClass} text-white placeholder-gray-300 max-h-[180px]`}
                disabled={isTyping || isCreatingChat || sendingFirstMessage}
              />
            </div>
            <button
              type="submit"
              disabled={!inputValue.trim() || isTyping || isCreatingChat || sendingFirstMessage}
              className="backdrop-blur-md bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white disabled:opacity-50 disabled:cursor-not-allowed px-3 sm:px-4 py-2 sm:py-3 rounded-xl transition-colors h-auto shadow-lg shadow-black/30"
            >
              <Send className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            </form>
          </div>
        </div>

        {/* Modals */}
        <InsufficientCreditsModal
          isOpen={showInsufficientCreditsModal}
          onClose={handleCloseInsufficientCreditsModal}
          currentBalance={creditsBalance}
          onUpgrade={handleUpgrade}
        />
      </div>
    </div>
  );
};

export default React.memo(ChatInterface);