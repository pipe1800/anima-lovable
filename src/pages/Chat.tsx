import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { SidebarProvider } from '@/components/ui/sidebar';
import ChatInterface from '@/components/chat/ChatInterface';
import { ChatLayout } from '@/components/chat/ChatLayout';
import OnboardingChecklist from '@/components/OnboardingChecklist';
import { TutorialManager } from '@/components/tutorial/TutorialManager';
import { useContextManagement } from '@/hooks/useContextManagement';
import type { TrackedContext } from '@/types/chat';
import logger from '@/utils/logger';

const Chat = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [characterData, setCharacterData] = useState<any>(null);
  const [characterLoading, setCharacterLoading] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
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
  const location = useLocation();
  const navigate = useNavigate();
  const { characterId, chatId } = useParams();
  
  const selectedCharacter = location.state?.selectedCharacter;
  const existingChatId = chatId || location.state?.existingChatId;
  const fromOnboarding = location.state?.fromOnboarding;

  // Scoped logger (declare before any usage)
  const log = logger.scoped('ChatPage');

  // Set localStorage flag for tutorial trigger when coming from onboarding
  useEffect(() => {
    if (fromOnboarding && user) {
      log.debug('🎓 Chat: Setting fromOnboarding flag for tutorial');
      localStorage.setItem('fromOnboarding', 'true');
    }
  }, [fromOnboarding, user, log]);

  // Load context from database and sync with local state
  const { context: loadedContext, reloadContext, isLoading: contextLoading } = useContextManagement(
    currentChatId, 
    characterId || '', 
    user?.id || null
  );

  // Define triggerInitialExtraction before it's used
  const triggerInitialExtraction = useCallback(async () => {
    log.info('🔄 Triggering initial context extraction for new chat...');
    
    try {
      // Get addon settings for context extraction
      log.debug('📥 Fetching user global settings...');
      const { data: globalSettings, error: settingsError } = await supabase
        .from('user_global_chat_settings')
        .select('*')
        .eq('user_id', user?.id as string)
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

        // Call extract-addon-context in INITIAL mode for character card + greeting
        log.debug('📞 Calling extract-addon-context function...');
        const { data, error } = await supabase.functions.invoke('extract-addon-context', {
          body: {
            chat_id: chatId,
            character_id: characterId,
            addon_settings: addonSettings,
            mode: 'initial'
          }
        });

        log.debug('📤 Function call result:', { data, error });

        if (error) {
          log.error('❌ Initial context extraction error:', error);
        } else if (data?.success && data?.context_summary) {
          log.info('✅ Initial context extracted for greeting message:', data.context_summary);
        } else {
          log.debug('⏭️ Initial context extraction skipped or failed:', data?.message);
        }
      } else {
        log.debug('⚠️ No global settings found - skipping context extraction');
      }
    } catch (error) {
      log.error('❌ Error in initial context extraction:', error);
    }
  }, [characterId, chatId, user?.id, log]);

  // Add a callback to reload context after message is sent
  const handleMessageSent = useCallback(async () => {
    log.debug('🔄 Message sent, context will be extracted by backend');
    
    // The backend (send-message-handler) now handles context extraction
    // Real-time subscription should pick up the changes automatically
    // But we can add a small delay and force reload as backup
    setTimeout(() => {
      log.debug('🔄 Triggering context reload as backup');
      reloadContext();
    }, 2000);
  }, [reloadContext, user?.id, characterId, currentChatId, log]);

  // Debug log the loaded context
  useEffect(() => {
    // Context debug information is available here if needed
  }, [loadedContext, currentChatId, characterId, user?.id, contextLoading]);

  // Sync context from database to local state when chat changes or context loads
  useEffect(() => {
    if (currentChatId && characterId && user?.id) {
      log.debug('🔄 Setting tracked context from database:', loadedContext);
      setTrackedContext(loadedContext);
    }
  }, [currentChatId, characterId, user?.id, loadedContext, log]);

  // ALL useEffect hooks must be at the top, before any conditional returns
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        
        // Check if onboarding is completed
        const isCompleted = session.user.user_metadata?.onboarding_completed;
        log.debug('Chat: Onboarding completed status:', isCompleted);
        
        setOnboardingCompleted(!!isCompleted);
        
        // Only show onboarding if it's NOT completed
        if (!isCompleted) {
          setShowOnboarding(true);
        }
      } else {
        navigate('/auth');
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          setUser(session.user);
          
          // Update onboarding status from the latest session
          const isCompleted = session.user.user_metadata?.onboarding_completed;
          setOnboardingCompleted(!!isCompleted);
          
          // Hide onboarding if completed
          if (isCompleted) {
            setShowOnboarding(false);
          }
        } else if (!loading) {
          navigate('/auth');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate, loading, log]);

  // Initialize currentChatId from existingChatId
  useEffect(() => {
    if (existingChatId && !currentChatId) {
      setCurrentChatId(existingChatId);
    }
  }, [existingChatId, currentChatId]);

  // Character data fetching effect - MOVED TO TOP
  useEffect(() => {
    // Skip if no user or still loading
    if (!user || loading) return;
    
    // Initialize character data from selectedCharacter if available
    if (selectedCharacter) {
      setCharacterData(selectedCharacter);
      return;
    }
    
    // If no selectedCharacter and no characterId, redirect to dashboard
    if (!characterId) {
      navigate('/dashboard');
      return;
    }
    
    // Fetch character data from the URL parameter
    const fetchCharacter = async () => {
      setCharacterLoading(true);
      try {
        const { data, error } = await supabase
          .from('characters')
          .select('*')
          .eq('id', characterId)
          .single();
        
        if (error || !data) {
          log.error('Error fetching character:', error);
          navigate('/dashboard');
          return;
        }
        
        setCharacterData(data);
      } catch (error) {
        log.error('Error fetching character:', error);
        navigate('/dashboard');
      } finally {
        setCharacterLoading(false);
      }
    };
    
    fetchCharacter();
  }, [user, loading, characterId, selectedCharacter, navigate, existingChatId, chatId, currentChatId, log]);

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

  // Log world info changes
  useEffect(() => {
    log.debug('🌍 Chat.tsx: selectedWorldInfoId state changed to:', selectedWorldInfoId);
  }, [selectedWorldInfoId, log]);

  const handleChatCreated = useCallback((chatId: string) => {
    log.info('💬 Chat page: New chat created with ID:', chatId);
    log.debug('🔍 Debug - Chat created context check:', {
      chatId,
      hasLoadedContext: !!loadedContext,
    });
    
    // 🎯 EXTRACT INITIAL CONTEXT FROM CHARACTER CARD + GREETING
    if (characterId && user?.id) {
      triggerInitialExtraction();
    }
  }, [characterId, user?.id, triggerInitialExtraction, log, loadedContext]);

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
