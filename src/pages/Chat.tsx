import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SidebarProvider } from '@/components/ui/sidebar';
import ChatInterface from '@/components/chat/ChatInterface';
import { ChatLayout } from '@/components/chat/ChatLayout';
import OnboardingChecklist from '@/components/OnboardingChecklist';
import { TutorialManager } from '@/components/tutorial/TutorialManager';
import { useContextManagement } from '@/hooks/useContextManagement';
import type { TrackedContext } from '@/types/chat';
import logger from '@/utils/logger';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { queryConfigs } from '@/queries/chatQueries';

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
    characterPosition: 'No context'
  });
  
  const log = logger.scoped('ChatPage');

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
      setShowOnboarding(!isCompleted);
      setLoading(false);
    } else {
      // Not authenticated
      setLoading(false);
      navigate('/auth');
    }
  }, [currentUser, fromOnboarding, navigate, log]);

  // Load context from database and sync with local state
  const { context: loadedContext, reloadContext, isLoading: contextLoading } = useContextManagement(
    currentChatId, 
    characterId || '', 
    currentUser?.id || null
  );

  const triggerInitialExtraction = useCallback(async () => {
    log.info('🔄 Triggering initial context extraction for new chat...');
    try {
      log.debug('📥 Fetching user global settings...');
      const { data: globalSettings, error: settingsError } = await supabase
        .from('user_global_chat_settings')
        .select('*')
        .eq('user_id', currentUser?.id as string)
        .single();

      log.debug('⚙️ Global settings result:', { globalSettings, settingsError });

      if (globalSettings) {
        const addonSettings = {
          moodTracking: globalSettings.mood_tracking,
          clothingInventory: globalSettings.clothing_inventory,
          locationTracking: globalSettings.location_tracking,
          timeAndWeather: globalSettings.time_and_weather,
          relationshipStatus: globalSettings.relationship_status,
          characterPosition: globalSettings.character_position
        };

        log.debug('🎛️ Mapped addon settings:', addonSettings);

        const { data, error } = await supabase.functions.invoke('extract-addon-context', {
          body: {
            chat_id: chatId,
            character_id: characterId,
            addon_settings: addonSettings,
            mode: 'initial'
          }
        });

        log.debug('📤 Function call result:', { data, error });
      } else {
        log.debug('⚠️ No global settings found - skipping context extraction');
      }
    } catch (error) {
      log.error('❌ Error in initial context extraction:', error);
    }
  }, [characterId, chatId, currentUser?.id, log]);

  const handleMessageSent = useCallback(async () => {
    log.debug('🔄 Message sent, context will be extracted by backend');
    setTimeout(() => {
      log.debug('🔄 Triggering context reload as backup');
      reloadContext();
    }, 2000);
  }, [reloadContext, log]);

  // Dedupe: Prefer react-query for character details, avoid manual fetch
  const characterDetailsQuery = useQuery({
    ...(characterId ? queryConfigs.characterDetails(characterId) : { queryKey: ['character', 'details', 'none'], queryFn: async () => null }),
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
    setCurrentChatId(chatId); // keep local state in sync
    log.debug('🔍 Debug - Chat created context check:', {
      chatId,
      hasLoadedContext: !!loadedContext,
    });
    if (characterId && currentUser?.id) {
      triggerInitialExtraction();
    }
  }, [characterId, currentUser?.id, triggerInitialExtraction, log, loadedContext]);

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
      <div className="flex h-screen w-full">
        {/* Onboarding Checklist - Mobile Responsive */}
        {showOnboarding && !onboardingCompleted && (
          <div className="fixed inset-0 z-50 md:relative md:inset-auto">
            <OnboardingChecklist
              currentStep={isFirstMessage ? 2 : 3}
              isVisible={true}
              isCompleting={!isFirstMessage}
            />
          </div>
        )}

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
