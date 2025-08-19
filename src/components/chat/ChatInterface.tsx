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
import { useUserGlobalChatSettings } from '@/queries/chatSettingsQueries';
import { createChat } from '@/lib/chat-operations';
import { handleChatError } from '@/utils/chatErrorHandling';
import logger from '@/utils/logger';
import { getPersonaById, type Persona } from '@/lib/persona-operations';
import { queryConfigs, queryKeys } from '@/queries/chatQueries';
import { useQuery } from '@tanstack/react-query';
import { useChatBootstrap } from '@/contexts/ChatBootstrapContext';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getGreetingVariants } from '@/lib/chat-operations';
import { supabase } from '@/integrations/supabase/client';

// Debug components - Only load when needed
const AddonDebugPanel = lazy(() => import('@/components/debug/AddonDebugPanel').then(module => ({
  default: module.AddonDebugPanel
})));

// Loading fallback for debug components
const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-4">
    <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
  </div>
);

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
  characterDetails
}: ChatInterfaceProps) => {
  const [inputValue, setInputValue] = useState('');
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [currentChatId, setCurrentChatId] = useState<string | null>(existingChatId || null);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(propSelectedPersonaId || null);
  const [selectedPersonaData, setSelectedPersonaData] = useState<Persona | null>(null);
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
  const greetingVariants = React.useMemo(() => getGreetingVariants((characterDetails as any) || (character as any)), [characterDetails, character]);
  const hasMultipleGreetings = greetingVariants.length > 1;

  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const logRef = useRef(logger.scoped('ChatInterface'));
  const log = logRef.current;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const bootstrap = (() => { try { return useChatBootstrap(); } catch { return null; }})();

  // Unified avatar resolution (prop > prop.avatar_url > bootstrap.character.avatar_url > fallback)
  const avatarUrl = React.useMemo(() => {
    return (
      (character as any).avatar ||
      (character as any).avatar_url ||
      (bootstrap?.character as any)?.avatar_url ||
      '/default_avatar.jpg'
    );
  }, [character, bootstrap]);

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
    streamingMessage,
    _source: messageSource
  } = useChatUnified(currentChatId, character.id);
  useEffect(() => { log.debug('Message source:', messageSource); }, [messageSource, log]);
  // Reintroduce effectiveTrackedContext (was removed during duplicate cleanup)
  const effectiveTrackedContext = parentTrackedContext || unifiedTrackedContext;
  // Derived: whether any user message exists in this chat (used to lock greeting picker)
  const hasUserMessage = React.useMemo(() => {
    if (!messages || messages.length === 0) return false;
    return messages.some((m: any) => {
      if (m.is_ai_message === true) return false;
      if (m.isUser === true) return true;
      if (m.role === 'user') return true;
      if (m.author_id && m.is_ai_message !== true) return true; // replaced user_id with author_id
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
  const { data: globalSettings } = useUserGlobalChatSettings();
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
  const waitForGreetingPersistence = useCallback(async (newChatId: string, timeoutMs = 2000) => {
    const start = Date.now();
    let attempt = 0;
    while (Date.now() - start < timeoutMs) {
      attempt++;
      try {
        const { data } = await supabase
          .from('messages')
          .select('content,is_ai_message,message_order')
            .eq('chat_id', newChatId)
            .eq('is_ai_message', true)
            .order('message_order', { ascending: true })
            .limit(1);
        if (data && data.length > 0) {
          const msg = data[0];
          // Accept if first AI message present; optionally verify it matches a known greeting variant
          if (!greetingPersisted) setGreetingPersisted(true);
          if (greetingVariants.length === 0 || greetingVariants.includes(msg.content) || msg.message_order === 1) {
            return { found: true, content: msg.content };
          }
        }
      } catch {}
      // Exponential-ish backoff within bounds
      const delay = Math.min(100 + attempt * 75, 300);
      await new Promise(r => setTimeout(r, delay));
    }
    return { found: false };
  }, [greetingVariants, greetingPersisted]);

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

      // Wait for greeting persistence (extended)
      const result = await waitForGreetingPersistence(newChatId);
      if (!result.found) {
        log.warn('⚠️ Greeting not detected within wait window; proceeding anyway');
      } else {
        log.info('✅ Greeting persistence confirmed');
      }

      // Force refetch of messages now that greeting should exist
      try {
        await queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(newChatId) });
      } catch {}

      // Poll cache until greeting message visible or timeout (avoid flicker)
      const visibilityStart = Date.now();
      const visibilityTimeout = 1500; // ms
      let greetingVisible = false;
      while (Date.now() - visibilityStart < visibilityTimeout) {
        const cache: any = queryClient.getQueryData(queryKeys.chat.messages(newChatId));
        const msgs = cache?.pages?.flatMap((p: any) => p.messages) || [];
        if (msgs.some((m: any) => m.isUser === false && (!greetingVariants.length || greetingVariants.includes(m.content)))) {
          greetingVisible = true;
          break;
        }
        await new Promise(r => setTimeout(r, 100));
      }
      if (!greetingVisible) log.warn('⚠️ Greeting not visible in cache before first user message send');

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
  }, [user, currentChatId, sendingFirstMessage, greetingVariants, selectedGreetingIndex, log, character.id, character.name, propSelectedPersonaId, currentAddonSettings, selectedPersonaId, selectedWorldInfoId, effectiveTrackedContext, onChatCreated, sendMessage, onFirstMessage, toast, chatPhase, waitForGreetingPersistence, queryClient]);

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

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Refocus input when AI finishes responding to keep flow fluent
  useEffect(() => {
    const onAiFinished = () => {
      // Delay a tick to ensure DOM settles
      setTimeout(() => inputRef.current?.focus(), 50);
    };
    window.addEventListener('chat-ai-response-finished', onAiFinished as any);
    return () => window.removeEventListener('chat-ai-response-finished', onAiFinished as any);
  }, []);

  // Sync selected persona when prop changes
  useEffect(() => {
    if (propSelectedPersonaId !== undefined) {
      log.debug('🔄 ChatInterface: Persona prop changed to:', propSelectedPersonaId);
      setSelectedPersonaId(propSelectedPersonaId);
    }
  }, [propSelectedPersonaId]);

  // Manual guarded persona fetch removed in favor of react-query
  const personaQuery = useQuery({
    ...(selectedPersonaId ? queryConfigs.personaById(selectedPersonaId) : { queryKey: ['persona','none'], queryFn: async () => null }),
    enabled: !!selectedPersonaId,
  });
  useEffect(() => {
    if (bootstrap?.selectedPersona && !propSelectedPersonaId && !selectedPersonaId) {
      setSelectedPersonaId(bootstrap.selectedPersona.id);
    }
  }, [bootstrap, propSelectedPersonaId, selectedPersonaId]);
  useEffect(() => {
    if (personaQuery.data) setSelectedPersonaData(personaQuery.data as Persona);
  }, [personaQuery.data]);

  // Send message
  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !user) return;
    if (!currentChatId) {
      const firstMsg = inputValue;
      setInputValue('');
      // Keep greeting bubble visible (disabled) until persistence; do not pre-dismiss
      await createChatAndSendFirstMessage(firstMsg);
      return;
    }
    if (!currentChatId) return;

    // Check if user has enough credits
    if (creditsBalance < 1) {
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

      // Immediately refocus after sending
      requestAnimationFrame(() => inputRef.current?.focus());

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

    // Fetch last user message content to resend
    const { data: lastUserMsg, error: lastMsgErr } = await supabase
      .from('messages')
      .select('content')
      .eq('chat_id', currentChatId)
      .eq('is_ai_message', false)
      .order('message_order', { ascending: false })
      .limit(1)
      .single();

    if (lastMsgErr || !lastUserMsg?.content) {
      console.warn('No last user message found to regenerate', { lastMsgErr });
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
      message: lastUserMsg.content as string,
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
  }, [user, currentChatId, creditsBalance, character.id, currentAddonSettings, selectedPersonaId, selectedWorldInfoId]);

  // Regeneration UI map: messageId -> streaming content
  const [regeneratingContentById, setRegeneratingContentById] = useState<Record<string, string>>({});

  const regenerateMessageById = useCallback(async (aiMessageId: string) => {
    if (!user || !currentChatId) return;
    if (creditsBalance < 1) {
      setShowInsufficientCreditsModal(true);
      return;
    }
    try {
      setRegeneratingContentById(prev => ({ ...prev, [aiMessageId]: '' }));

      // Delete AI message in backend first (frontend will overlay until refresh)
      await supabase.from('messages').delete().eq('id', aiMessageId);

      // Auth token
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) throw new Error('Authentication failed');
      const token = sessionData.session.access_token;

      // Start regenerate stream
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

      // Stream handling (smooth or instant)
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      const { StreamingMessageParser, parseSSEMessage } = await import('@/lib/streaming-utils');
      const parser = new StreamingMessageParser();
      let full = '';

      const scheduleAppend = async (text: string) => {
        if (!text) return;
        if (streamingMode !== 'smooth') { full += text; return; }
        const size = 24;
        for (let i = 0; i < text.length; i += size) {
          full += text.slice(i, i + size);
          setRegeneratingContentById(prev => ({ ...prev, [aiMessageId]: full }));
          await new Promise(r => setTimeout(r, 16));
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const dataLines = parser.parseChunk(value);
          for (const data of dataLines) {
            const obj = parseSSEMessage(data);
            if (!obj) continue;
            if (obj.done === true) {
              // Flush for instant mode
              if (streamingMode !== 'smooth' && full) {
                setRegeneratingContentById(prev => ({ ...prev, [aiMessageId]: full }));
              }
              // Let realtime update, then refresh cache
              setTimeout(() => {
                if (currentChatId) {
                  queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(currentChatId) });
                  // Removed credits invalidate (snapshot + realtime)
                }
                setRegeneratingContentById(prev => {
                  const { [aiMessageId]: _, ...rest } = prev; return rest;
                });
              }, 300);
              return;
            }
            if (typeof obj?.content === 'string' && obj.content) {
              await scheduleAppend(obj.content);
            } else if (obj?.choices?.[0]?.delta?.content) {
              await scheduleAppend(obj.choices[0].delta.content as string);
            }
          }
        }
      } catch (e) {
        throw e;
      }
    } catch (err: any) {
      console.error('Regenerate failed:', err);
      setRegeneratingContentById(prev => {
        const { [aiMessageId]: _, ...rest } = prev; return rest;
      });
      if (err?.message?.includes('credits')) setShowInsufficientCreditsModal(true);
      else toast({ title: 'Error', description: err.message || 'Failed to regenerate message', variant: 'destructive' });
    }
  }, [user, currentChatId, creditsBalance, currentAddonSettings, selectedPersonaId, selectedWorldInfoId, character.id, streamingMode, queryClient, toast]);

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
              src={avatarUrl}
              alt={character.name}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/default_avatar.jpg'; }}
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
                  src={avatarUrl}
                  alt={character.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/default_avatar.jpg'; }}
                />
              </div>
            )}
            {/* Mobile avatar (matches MessageGroup) */}
            {showCharacterAvatar && (
              <div className="sm:hidden w-[3.3rem] h-[3.3rem] rounded-full overflow-hidden bg-[#1f1f1f] border border-white/10 flex items-center justify-center shrink-0">
                <img
                  src={avatarUrl}
                  alt={character.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/default_avatar.jpg'; }}
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
      const showImagePanel = showCharacterAvatar && !!avatarUrl;
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
                    backgroundImage: `url(${avatarUrl})`,
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
        <Suspense fallback={<LoadingSpinner />}>
          {bootstrap?.featureFlags?.debugPanel ? (
            <AddonDebugPanel characterId={character.id} userId={user?.id} chatId={currentChatId} />
          ) : null}
        </Suspense>
        
        {/* Messages Area - Mobile Responsive */}
        <div className="flex-1 overflow-hidden">
          {/* Removed legacy greeting picker bar; unified into styled bubble */}
          {renderGreetingBubble()}
          {currentChatId && (
            <ChatMessages 
              chatId={currentChatId}
              character={{ ...character, avatar: avatarUrl }}
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
            />
          )}
        </div>

        {/* Typing Indicator (thin) */}
        <div className="px-2 sm:px-3 py-1 flex items-center">
          <div 
            className={`flex items-center space-x-2 text-gray-400 transition-all duration-300 ${
              (isTyping || isStreaming) ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
            }`}
          >
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <span className="text-sm sm:text-base">
              {(() => {
                const raw = isStreaming ? `${character.name} is responding...` : `${character.name} is typing...`;
                return raw.length > 50 ? raw.slice(0,47) + '…' : raw;
              })()}
            </span>
          </div>
        </div>

        {/* Input Area */}
        <div className="p-3 sm:p-4 bg-transparent">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2 sm:gap-3">
            <div className="flex-1 backdrop-blur-md bg-black/30 border border-white/10 rounded-xl px-3 sm:px-4 py-2 sm:py-3 shadow-lg shadow-black/30">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={`Message ${character.name.length > 40 ? character.name.slice(0,37) + '…' : character.name}...`}
                className="w-full bg-transparent outline-none text-sm sm:text-base text-white placeholder-gray-300"
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