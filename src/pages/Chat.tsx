import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Billing } from '@/data';
import extractAddonContext from '@/data/edge/extractAddonContext';
import { SidebarProvider } from '@/components/ui/sidebar';
import ChatInterface from '@/components/chat/ChatInterface';
import { ChatLayout } from '@/components/chat/ChatLayout';
import { TutorialManager } from '@/components/tutorial/TutorialManager';
import { chatQueryConfigs, chatQueryKeys } from '@/data/chats/queryKeys';
import type { TrackedContext } from '@/types/chat';
import logger from '@/utils/logger';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { useUserGlobalChatSettings } from '@/data/chats/settings';

const Chat = () => {
  const { user: currentUser } = useAuth();
  // Define routing hooks and derived values BEFORE state that depends on them
  const location = useLocation();
  const navigate = useNavigate();
  const { characterId, chatId } = useParams();
  const selectedCharacter = (location.state as any)?.selectedCharacter;
  const existingChatId = chatId || (location.state as any)?.existingChatId;
  const fromOnboarding = (location.state as any)?.fromOnboarding;

  const [loading, setLoading] = useState(true);
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [characterData, setCharacterData] = useState<any>(null);
  const [characterLoading, setCharacterLoading] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(existingChatId || null);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [selectedWorldInfoId, setSelectedWorldInfoId] = useState<string | null>(null);
  const [trackedContext, setTrackedContext] = useState<TrackedContext>({
    moodTracking: 'No context',
    clothingInventory: 'No context',
    locationTracking: 'No context',
    timeAndWeather: 'No context',
    relationshipStatus: 'No context',
    characterPosition: 'No context',
    enchantmentStatus: 'No context',
    itemInventory: 'No context'
  } as any);
  
  const log = logger.scoped('ChatPage');
  const initialExtractionAttemptedRef = useRef(false);

  // React to auth changes via AuthContext (avoids duplicate subscriptions)
  useEffect(() => {
    if (currentUser) {
      // Tutorial flag when arriving from onboarding
      if (fromOnboarding) {
        log.debug('🎓 Chat: Setting fromOnboarding flag for tutorial');
        localStorage.setItem('fromOnboarding', 'true');
      }
      const isCompleted = (currentUser as any).user_metadata?.onboarding_completed;
      setOnboardingCompleted(!!isCompleted);
      setShowOnboarding(false);
      setLoading(false);
    } else {
      // Not authenticated
      setLoading(false);
      navigate('/auth');
    }
  }, [currentUser, fromOnboarding, navigate, log]);

  // Load context from database and sync with local state
  // Context now sourced from unified chat hook via ChatInterface; disabling dedicated context polling to avoid duplicate GET /chat_context
  const reloadContext = () => {}; // no-op placeholder

  // Single authoritative global settings fetch; children receive as override and skip their own queries
  const { data: globalSettings } = useUserGlobalChatSettings();
  // Fetch user credits once here to avoid duplicate fetch in ChatLayout & ChatInterface
  const { data: creditsBalance = 0 } = useQuery({
    ...(currentUser?.id ? {
      queryKey: chatQueryKeys.user.credits(currentUser.id),
      queryFn: async () => {
        const res = await Billing.getUserCredits(undefined as any, currentUser.id); // client param ignored internally
        if (res.error) throw res.error;
        return res.data?.balance || 0;
      }
    } : { queryKey: chatQueryKeys.user.credits('none'), queryFn: async () => 0 }),
    enabled: !!currentUser?.id,
  });

  // NOTE: Backend now auto-triggers initial extraction during chat creation.
  // Frontend trigger retained behind feature flag (disabled) to avoid duplicate extraction & UI flicker.
  const frontendInitialExtractionEnabled = false;
  const triggerInitialExtraction = useCallback(async (forcedChatId?: string) => {
    if (!frontendInitialExtractionEnabled) {
      log.debug('⏭️ Frontend initial extraction disabled (handled server-side)');
      initialExtractionAttemptedRef.current = true;
      return;
    }
    const activeChatId = forcedChatId || currentChatId || chatId;
    if (!activeChatId || initialExtractionAttemptedRef.current) return;
    if (!globalSettings) return; // wait until settings are loaded (React Query cached)

    const addonSettings = {
      moodTracking: globalSettings.mood_tracking,
      clothingInventory: globalSettings.clothing_inventory,
      locationTracking: globalSettings.location_tracking,
      timeAndWeather: globalSettings.time_and_weather,
      relationshipStatus: globalSettings.relationship_status,
      characterPosition: globalSettings.character_position
    };

    if (!Object.values(addonSettings).some(Boolean)) {
      log.debug('⏭️ All addons disabled; skipping extract-addon-context call');
      initialExtractionAttemptedRef.current = true;
      return;
    }

    log.info('🔄 Triggering initial context extraction (event-driven) for chat', activeChatId);
    try {
      const { data, error } = await extractAddonContext({
        chatId: activeChatId,
        characterId: characterId,
        addonSettings: addonSettings,
        mode: 'initial'
      });
      if (error) {
        log.warn('extract-addon-context error', error);
        return;
      }
      log.debug('📤 extract-addon-context success', data);
      initialExtractionAttemptedRef.current = true;
    } catch (error) {
      log.error('❌ Error in initial context extraction:', error);
    }
  }, [characterId, chatId, currentChatId, globalSettings, log]);

  // Single event-driven extraction: when AI finishes first streamed response
  useEffect(() => {
    if (!frontendInitialExtractionEnabled) return; // server handles initial extraction
    const handler = () => triggerInitialExtraction();
    window.addEventListener('chat-ai-response-finished', handler, { once: true } as any);
    return () => window.removeEventListener('chat-ai-response-finished', handler as any);
  }, [triggerInitialExtraction, frontendInitialExtractionEnabled]);

  // Dedupe: Prefer react-query for character details, avoid manual fetch
  const characterDetailsQuery = useQuery({
    ...(characterId ? chatQueryConfigs.characterDetails(characterId) : { queryKey: ['character', 'details', 'none'], queryFn: async () => null }),
    enabled: !!characterId && !selectedCharacter,
  });

  useEffect(() => {
    // Skip if no user or still loading
    if (!currentUser || loading) return;

    // If a pre-selected character was passed via navigation state, use it directly
    if (selectedCharacter) {
      setCharacterData(selectedCharacter);
      setCharacterLoading(false);
      return;
    }

    // If no characterId, redirect to dashboard
    if (!characterId) {
      navigate('/dashboard');
      return;
    }

    // Use character details from react-query when available
    setCharacterLoading(true);
    const d: any = characterDetailsQuery.data;
    if (d && (d.data || d.name)) {
      const details = d.data || d; // handle either wrapped or direct
      setCharacterData({
        id: details.id,
        name: details.name,
        tagline: details.tagline,
        avatar_url: details.avatar_url,
      });
      setCharacterLoading(false);
    }
  }, [currentUser, loading, selectedCharacter, characterId, navigate, characterDetailsQuery.data]);

  const handleFirstMessage = () => {
    setIsFirstMessage(false);
    setOnboardingCompleted(true);
    if (showOnboarding) {
      setTimeout(() => setShowOnboarding(false), 3000);
    }
  };

  const handlePersonaChange = (personaId: string | null) => {
    setSelectedPersonaId(personaId);
  };

  const handleWorldInfoChange = useCallback((worldInfoId: string | null) => {
    log.debug('🌍 Chat.tsx: World info change received:', worldInfoId);
    setSelectedWorldInfoId(worldInfoId);
  }, [log]);

  useEffect(() => {
    log.debug('🌍 Chat.tsx: selectedWorldInfoId state changed to:', selectedWorldInfoId);
  }, [selectedWorldInfoId, log]);

  const handleChatCreated = useCallback((chatId: string) => {
    log.info('💬 Chat page: New chat created with ID:', chatId);
    setCurrentChatId(chatId);
    triggerInitialExtraction(chatId); // try immediately (guarded)
  }, [triggerInitialExtraction, log]);

  const handleMessageSent = useCallback(async () => {
    log.debug('🔄 Message sent, scheduling context reload backup');
    setTimeout(() => reloadContext(), 2000);
  }, [reloadContext, log]);

  // Keep local state in sync with route param changes
  useEffect(() => {
    if (chatId && chatId !== currentChatId) {
      setCurrentChatId(chatId);
    }
  }, [chatId]);

  // If no character data available, show error
  if (!characterData) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <div className="text-white text-center">
          <div className="mb-4">No character selected</div>
          <button 
            onClick={() => navigate('/dashboard')} 
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Map avatar_url to avatar for compatibility
  const character = {
    ...characterData,
    avatar: characterData.avatar_url || characterData.avatar,
    fallback: characterData.name?.split(' ').map((n: string) => n[0]).join('') || 'C'
  };

  // Provide preloaded details to ChatLayout to avoid duplicate fetching
  const preloadedDetails: any = (characterDetailsQuery.data as any)?.data || null;

  return (
    <SidebarProvider>
      <div className="flex h-screen-stable w-full md:h-screen">
        {/* Main Chat Layout */}
        <div className="flex-1 flex flex-col h-full">
          <ChatLayout 
            character={character} 
            currentChatId={currentChatId}
            trackedContext={trackedContext}
            onContextUpdate={setTrackedContext}
            onPersonaChange={handlePersonaChange}
            onWorldInfoChange={handleWorldInfoChange}
            characterDetails={preloadedDetails}
            creditsBalanceOverride={creditsBalance}
            globalSettingsOverride={globalSettings}
          >
            <ChatInterface
              character={character}
              onFirstMessage={handleFirstMessage}
              existingChatId={currentChatId}
              trackedContext={trackedContext}
              onContextUpdate={setTrackedContext}
              selectedPersonaId={selectedPersonaId}
              selectedWorldInfoId={selectedWorldInfoId}
              onChatCreated={handleChatCreated}
              onMessageSent={handleMessageSent}
              characterDetails={preloadedDetails}
              creditsBalanceOverride={creditsBalance}
              globalSettingsOverride={globalSettings}
            />
          </ChatLayout>
        </div>

        {/* Tutorial Manager */}
        <TutorialManager shouldStart={fromOnboarding && onboardingCompleted} />
      </div>
    </SidebarProvider>
  );
};

export default Chat;
